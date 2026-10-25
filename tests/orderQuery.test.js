const {
  MAX_LIMIT,
  OrderQueryError,
  parseOrderListQuery,
  buildPagination
} = require('../src/utils/orderQuery');

describe('Order list query module', () => {
  describe('預設值', () => {
    it('不帶參數時為第 1 頁、每頁 10 筆、不篩選狀態', () => {
      expect(parseOrderListQuery({})).toEqual({ status: null, page: 1, limit: 10 });
    });

    it('未傳入 query 物件時也使用預設值', () => {
      expect(parseOrderListQuery()).toEqual({ status: null, page: 1, limit: 10 });
    });
  });

  describe('status 篩選', () => {
    it.each(['pending', 'paid', 'failed'])('允許 status=%s', status => {
      expect(parseOrderListQuery({ status }).status).toBe(status);
    });

    it.each([
      ['未知狀態', 'unknown'],
      ['大寫', 'PAID'],
      ['空字串', ''],
      ['重複參數（陣列）', ['paid', 'pending']]
    ])('%s回傳錯誤', (_label, status) => {
      expect(() => parseOrderListQuery({ status })).toThrow(OrderQueryError);
    });
  });

  describe('page 與 limit', () => {
    it.each([
      ['page=3', { page: '3' }, { page: 3, limit: 10 }],
      ['limit=5', { limit: '5' }, { page: 1, limit: 5 }],
      ['limit=50 為上限值', { limit: '50' }, { page: 1, limit: 50 }],
      ['limit=51 以 50 計', { limit: '51' }, { page: 1, limit: MAX_LIMIT }],
      ['limit=100 以 50 計', { limit: '100' }, { page: 1, limit: MAX_LIMIT }]
    ])('%s', (_label, query, expected) => {
      expect(parseOrderListQuery(query)).toMatchObject(expected);
    });

    it.each([
      ['page=0', { page: '0' }],
      ['page=-1', { page: '-1' }],
      ['page=1.5', { page: '1.5' }],
      ['page=abc', { page: 'abc' }],
      ['page 空字串', { page: '' }],
      ['limit=0', { limit: '0' }],
      ['limit=-1', { limit: '-1' }],
      ['limit=3abc', { limit: '3abc' }]
    ])('%s回傳錯誤', (_label, query) => {
      expect(() => parseOrderListQuery(query)).toThrow(OrderQueryError);
    });

    it('錯誤代碼為 VALIDATION_ERROR', () => {
      try {
        parseOrderListQuery({ page: '0' });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('buildPagination', () => {
    it.each([
      [{ page: 1, limit: 10, total: 12 }, 2],
      [{ page: 3, limit: 5, total: 12 }, 3],
      [{ page: 1, limit: 10, total: 10 }, 1],
      [{ page: 1, limit: 10, total: 0 }, 0]
    ])('%o 的 totalPages 為 %i', (input, totalPages) => {
      expect(buildPagination(input)).toEqual({ ...input, totalPages });
    });
  });
});
