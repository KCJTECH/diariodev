// Paginação e ordenação seguras: perPage limitado, sort restrito a uma lista
// permitida por endpoint (§17.3).
export type Pagination = { page: number; perPage: number; skip: number; take: number };

export function parsePagination(page?: number, perPage?: number, maxPerPage = 100): Pagination {
  const p = Math.max(1, Math.floor(page ?? 1));
  const pp = Math.min(maxPerPage, Math.max(1, Math.floor(perPage ?? 25)));
  return { page: p, perPage: pp, skip: (p - 1) * pp, take: pp };
}

export function safeSort<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(requested as T) ? (requested as T) : fallback;
}
