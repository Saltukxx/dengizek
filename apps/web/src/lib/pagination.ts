// ---------------------------------------------------------------------------
// Sayfalama yardımcıları — ?sayfa=1&limit=50
// ---------------------------------------------------------------------------

import { count, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";

export interface PaginationParams {
  sayfa: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  sayfa: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parsePagination(url: URL, defaultLimit = DEFAULT_LIMIT): PaginationParams {
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? String(defaultLimit)) || defaultLimit),
  );
  return { sayfa, limit, offset: (sayfa - 1) * limit };
}

export function paginatedMeta<T>(
  items: T[],
  { sayfa, limit, totalCount }: PaginationParams & { totalCount: number },
): PaginatedResult<T> {
  return {
    items,
    sayfa,
    limit,
    totalCount,
    hasMore: sayfa * limit < totalCount,
  };
}

/** Drizzle tablo sorgusu için count + sayfalı liste. */
export async function paginatedQuery<TRow>(opts: {
  db: Db;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  where?: SQL;
  orderBy: SQL | SQL[];
  pagination: PaginationParams;
}): Promise<PaginatedResult<TRow>> {
  const { db, table, where, orderBy, pagination } = opts;
  const order = Array.isArray(orderBy) ? orderBy : [orderBy];

  const countQuery = db.select({ value: count() }).from(table);
  const dataQuery = db.select().from(table);

  const [countRow] = where ? await countQuery.where(where) : await countQuery;
  const totalCount = Number(countRow?.value ?? 0);

  const items = where
    ? await dataQuery
        .where(where)
        .orderBy(...order)
        .limit(pagination.limit)
        .offset(pagination.offset)
    : await dataQuery.orderBy(...order).limit(pagination.limit).offset(pagination.offset);

  return paginatedMeta(items as TRow[], { ...pagination, totalCount });
}
