'use strict';

/**
 * Shared list-query helpers: sorting, filtering and pagination for the
 * collection endpoints. All list routes accept `?page`, `?limit`, `?search`,
 * `?sortBy` and `?order`, which are validated before they reach this module.
 */

const DEFAULT_LIMIT = 20;

function sortItems(items, sortBy, order = 'asc', accessors = {}) {
  if (!sortBy) return items;

  const accessor = accessors[sortBy];
  if (typeof accessor !== 'function') return items;

  const direction = order === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (left === right) return 0;
    if (left === undefined || left === null) return 1;
    if (right === undefined || right === null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right), 'en', { sensitivity: 'base' }) * direction;
  });
}

function filterBySearch(items, search, fields) {
  if (!search) return items;
  const needle = search.toLowerCase();
  return items.filter((item) =>
    fields.some((field) => {
      const value = typeof field === 'function' ? field(item) : item[field];
      return typeof value === 'string' && value.toLowerCase().includes(needle);
    })
  );
}

function paginate(items, query = {}) {
  const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1;
  const limit = Number.isInteger(query.limit) && query.limit > 0 ? Math.min(query.limit, 100) : DEFAULT_LIMIT;
  const total = items.length;
  const start = (page - 1) * limit;

  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
  };
}

/** Convenience pipeline used by the collection controllers. */
function buildList({ records, query = {}, searchFields = [], accessors = {}, filters = {} }) {
  let items = records;

  for (const [key, predicate] of Object.entries(filters)) {
    if (query[key] !== undefined) {
      items = items.filter((record) => predicate(record, query[key]));
    }
  }

  items = filterBySearch(items, query.search, searchFields);
  items = sortItems(items, query.sortBy, query.order, accessors);

  return paginate(items, query);
}

module.exports = { sortItems, filterBySearch, paginate, buildList, DEFAULT_LIMIT };
