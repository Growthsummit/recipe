const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

/** Parse `?page=` and `?limit=` into safe integers plus SQL LIMIT/OFFSET values. */
export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requested));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Build the standard paginated response envelope. */
export function paginated(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
}
