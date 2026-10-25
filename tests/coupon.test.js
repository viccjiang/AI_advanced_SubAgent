const { CouponError, applyCoupon } = require('../src/utils/coupon');

function expectCouponError(fn, code) {
  expect(fn).toThrow(CouponError);
  try {
    fn();
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

describe('Coupon module', () => {
  describe('未使用優惠碼', () => {
    it.each([
      ['undefined', undefined],
      ['null', null]
    ])('couponCode 為 %s 時折扣為 0', (_label, couponCode) => {
      expect(applyCoupon({ couponCode, subtotal: 1000 })).toEqual({ couponCode: null, discount: 0 });
    });
  });

  describe('FLOWER100：滿 800 元折 100 元', () => {
    it.each([
      [800, 100],
      [1550, 100],
      [1600, 100]
    ])('商品小計 %i 元折 %i 元', (subtotal, expectedDiscount) => {
      expect(applyCoupon({ couponCode: 'FLOWER100', subtotal })).toEqual({
        couponCode: 'FLOWER100',
        discount: expectedDiscount
      });
    });

    it('商品小計 799 元未達門檻', () => {
      expectCouponError(() => applyCoupon({ couponCode: 'FLOWER100', subtotal: 799 }), 'COUPON_NOT_ELIGIBLE');
    });
  });

  describe('SPRING10：打 9 折、四捨五入、最多折 300 元', () => {
    it.each([
      [1000, 100],
      [1234, 123],
      [1235, 124],
      [3000, 300],
      [3500, 300],
      [5, 1]
    ])('商品小計 %i 元折 %i 元', (subtotal, expectedDiscount) => {
      expect(applyCoupon({ couponCode: 'SPRING10', subtotal })).toEqual({
        couponCode: 'SPRING10',
        discount: expectedDiscount
      });
    });
  });

  describe('優惠碼正規化', () => {
    it.each([
      ['flower100'],
      ['Flower100'],
      ['  FLOWER100  ']
    ])('「%s」視為 FLOWER100', (couponCode) => {
      expect(applyCoupon({ couponCode, subtotal: 800 }).couponCode).toBe('FLOWER100');
    });
  });

  describe('無效優惠碼', () => {
    it('SUMMER50 已失效', () => {
      expectCouponError(() => applyCoupon({ couponCode: 'SUMMER50', subtotal: 1000 }), 'COUPON_EXPIRED');
    });

    it.each([
      ['不存在的優惠碼', 'NOT-A-COUPON'],
      ['原型鏈屬性名稱', 'constructor'],
      ['空字串', ''],
      ['只有空白', '   '],
      ['數字', 100],
      ['物件', { code: 'FLOWER100' }]
    ])('%s回傳 COUPON_INVALID', (_label, couponCode) => {
      expectCouponError(() => applyCoupon({ couponCode, subtotal: 1000 }), 'COUPON_INVALID');
    });
  });
});
