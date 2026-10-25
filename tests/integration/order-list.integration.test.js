const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../setup/testServer');
const { db, resetDatabase } = require('./helpers');

async function registerMember(email) {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: '訂單列表會員' });

  expect(response.status).toBe(201);
  return response.body.data;
}

// Insert orders directly so status and created_at are deterministic
function insertOrder(userId, { status = 'pending', createdAt }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO orders (
       id, order_no, user_id, recipient_name, recipient_email, recipient_address,
       subtotal, shipping_fee, total_amount, status, created_at
     ) VALUES (?, ?, ?, '收件人', 'r@example.com', '台北市', 500, 120, 620, ?, ?)`
  ).run(id, `ORD-${id.slice(0, 8)}`, userId, status, createdAt);
  return id;
}

function listOrders(token, query = '') {
  return request(app)
    .get(`/api/orders${query}`)
    .set('Authorization', `Bearer ${token}`);
}

describe('Member order list integration', () => {
  let member;
  let other;
  let orderIds;

  beforeEach(async () => {
    resetDatabase();
    member = await registerMember('list-member@example.com');
    other = await registerMember('list-other@example.com');

    // 12 orders, one per minute; every third one is paid
    orderIds = Array.from({ length: 12 }, (_, i) =>
      insertOrder(member.user.id, {
        status: i % 3 === 0 ? 'paid' : 'pending',
        createdAt: `2026-01-01 10:${String(i).padStart(2, '0')}:00`
      })
    );
    insertOrder(other.user.id, { status: 'paid', createdAt: '2026-01-01 11:00:00' });
  });

  afterEach(() => {
    resetDatabase();
  });

  afterAll(() => {
    db.close();
  });

  it('分頁依建立時間由新到舊，跨頁不重複', async () => {
    const page1 = await listOrders(member.token, '?limit=5');
    const page2 = await listOrders(member.token, '?limit=5&page=2');
    const page3 = await listOrders(member.token, '?limit=5&page=3');

    const ids = [page1, page2, page3].flatMap(res => res.body.data.orders.map(order => order.id));
    expect(ids).toEqual([...orderIds].reverse());
    expect(page3.body.data.pagination).toEqual({ page: 3, limit: 5, total: 12, totalPages: 3 });
  });

  it('超出最後一頁時回傳空陣列與正確的 total', async () => {
    const res = await listOrders(member.token, '?page=5');

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toEqual([]);
    expect(res.body.data.pagination).toEqual({ page: 5, limit: 10, total: 12, totalPages: 2 });
  });

  it('status 篩選與分頁一起計算 total，且不含其他會員的訂單', async () => {
    const res = await listOrders(member.token, '?status=paid&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(2);
    expect(res.body.data.orders.every(order => order.status === 'paid')).toBe(true);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
  });

  it('參數錯誤時回傳 400 VALIDATION_ERROR 且 data 為 null', async () => {
    for (const query of ['?status=unknown', '?page=0', '?limit=-1', '?page=abc']) {
      const res = await listOrders(member.token, query);

      expect(res.status).toBe(400);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });
});
