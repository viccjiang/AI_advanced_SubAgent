// Coupon rules are hard-coded here; admin management is out of scope (Issue #1)
const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({ type: 'fixed', amount: 100, minSubtotal: 800, active: true }),
  SPRING10: Object.freeze({ type: 'percent', rate: 0.1, maxDiscount: 300, minSubtotal: 0, active: true }),
  SUMMER50: Object.freeze({ type: 'fixed', amount: 50, minSubtotal: 0, active: false })
});

const NO_COUPON = Object.freeze({ couponCode: null, discount: 0 });

class CouponError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CouponError';
    this.code = code;
  }
}

function normalizeCouponCode(code) {
  return code.trim().toUpperCase();
}

function calculateRawDiscount(coupon, subtotal) {
  if (coupon.type === 'fixed') {
    return coupon.amount;
  }
  return Math.min(Math.round(subtotal * coupon.rate), coupon.maxDiscount);
}

/**
 * Validate a coupon code against the order subtotal and return the discount.
 * The discount only applies to the subtotal and never exceeds it.
 * Throws CouponError when the code is unknown, expired or below its threshold.
 */
function applyCoupon({ couponCode, subtotal }) {
  if (couponCode === undefined || couponCode === null) {
    return NO_COUPON;
  }

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負有限數');
  }

  if (typeof couponCode !== 'string' || couponCode.trim() === '') {
    throw new CouponError('COUPON_INVALID', '優惠碼格式不正確');
  }

  const normalized = normalizeCouponCode(couponCode);
  const coupon = Object.prototype.hasOwnProperty.call(COUPONS, normalized) ? COUPONS[normalized] : null;

  if (!coupon) {
    throw new CouponError('COUPON_INVALID', '優惠碼無效');
  }

  if (!coupon.active) {
    throw new CouponError('COUPON_EXPIRED', '優惠碼已失效');
  }

  if (subtotal < coupon.minSubtotal) {
    throw new CouponError('COUPON_NOT_ELIGIBLE', `商品小計需滿 ${coupon.minSubtotal} 元才能使用此優惠碼`);
  }

  const discount = Math.min(calculateRawDiscount(coupon, subtotal), subtotal);

  return Object.freeze({ couponCode: normalized, discount });
}

module.exports = {
  COUPONS,
  CouponError,
  applyCoupon
};
