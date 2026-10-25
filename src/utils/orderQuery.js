// Member order list query rules: status filter and pagination
const { parsePositiveInteger } = require('./validators');

const ORDER_STATUSES = ['pending', 'paid', 'failed'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

class OrderQueryError extends Error {
  constructor(message) {
    super(message);
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * Parse `status`, `page` and `limit` from a query string object.
 * Omitted values fall back to defaults; limit above MAX_LIMIT is capped.
 * Throws OrderQueryError for an unknown status or a non-positive-integer page/limit.
 */
function parseOrderListQuery(query = {}) {
  const { status, page, limit } = query;

  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    throw new OrderQueryError(`status 必須為 ${ORDER_STATUSES.join('、')} 其中之一`);
  }

  const parsedPage = page === undefined ? DEFAULT_PAGE : parsePositiveInteger(page);
  if (parsedPage === null) {
    throw new OrderQueryError('page 必須為正整數');
  }

  const parsedLimit = limit === undefined ? DEFAULT_LIMIT : parsePositiveInteger(limit);
  if (parsedLimit === null) {
    throw new OrderQueryError('limit 必須為正整數');
  }

  const cappedLimit = Math.min(parsedLimit, MAX_LIMIT);
  // Huge page numbers lose precision and overflow SQLite OFFSET
  if (!Number.isSafeInteger(parsedPage * cappedLimit)) {
    throw new OrderQueryError('page 超出可查詢範圍');
  }

  return {
    status: status === undefined ? null : status,
    page: parsedPage,
    limit: cappedLimit
  };
}

function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = {
  ORDER_STATUSES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  OrderQueryError,
  parseOrderListQuery,
  buildPagination
};
