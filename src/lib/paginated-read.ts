export const COMPLETE_READ_PAGE_SIZE = 500;

interface PaginatedReadResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

/**
 * Read every row from a Supabase-style range query.
 *
 * Dashboard cards may use exact count-only queries, but drilldowns and grouped
 * breakdowns need the complete row set. Reading fixed-size ranges avoids the
 * project/API row cap silently truncating those views.
 */
export async function readAllPages<Row>(
  readPage: (from: number, to: number) => PromiseLike<PaginatedReadResult<Row>>,
  errorMessage: string,
  pageSize = COMPLETE_READ_PAGE_SIZE,
): Promise<Row[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Page size must be a positive integer.");
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) throw new Error(errorMessage);

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
