export function parsePagination(
  pageRaw: unknown,
  pageSizeRaw: unknown,
): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const requested = Number(pageSizeRaw ?? 20) || 20;
  const pageSize = Math.min(100, Math.max(1, requested));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
