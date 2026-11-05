export type PageResult<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

export function paginateItems<T>(items: readonly T[], requestedPage: number, requestedPageSize = 15): PageResult<T> {
  const pageSize = Number.isSafeInteger(requestedPageSize) ? Math.min(100, Math.max(1, requestedPageSize)) : 15;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(requestedPage) ? Math.min(totalPages, Math.max(1, requestedPage)) : 1;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total, totalPages };
}
