/**
 * Server-only Google Sheets client for match reports.
 * Uses the Lovable connector gateway (google_sheets) — auth is set via
 * LOVABLE_API_KEY + GOOGLE_SHEETS_API_KEY env vars, injected server-side.
 *
 * NEVER import this file from a route or *.functions.ts module scope.
 */
import { SHEET_ID, SHEET_TAB } from "./schema";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_sheets/v4";

function authHeaders(): HeadersInit {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovable || !conn) {
    throw new Error("Google Sheets connector is not linked. Set LOVABLE_API_KEY and GOOGLE_SHEETS_API_KEY.");
  }
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": conn,
    "Content-Type": "application/json",
  };
}

/**
 * Fetch through the connector gateway with automatic retry + exponential
 * backoff for transient failures (502/503/504, 429, and network errors).
 *
 * Non-retryable statuses (4xx other than 429) return immediately so the
 * caller can surface the real error. Successful responses return on the
 * first try — retries only fire when the gateway itself is flaky.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${GATEWAY_BASE}${path}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...authHeaders(), ...(init?.headers ?? {}) },
      });
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
        return res;
      }
      // Honor Retry-After when present, else exponential backoff with jitter.
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      console.warn(
        `[sheets] gateway ${res.status} on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${backoff}ms`,
      );
      await sleep(backoff);
      continue;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) break;
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      console.warn(
        `[sheets] network error on attempt ${attempt}/${MAX_ATTEMPTS}: ${(err as Error)?.message}; retrying in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Google Sheets gateway request failed after retries.");
}


/** Fetch all data rows (skips header). Returns raw string rows + first-row offset (2). */
export async function readAllRows(): Promise<{ rows: string[][]; firstDataRow: number }> {
  const range = `'${SHEET_TAB}'!A2:O`;
  const res = await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${encodeURI(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheets] readAllRows failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets read failed [${res.status}]`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  const rows = (data.values ?? []).map((r) => r.map((c) => (c == null ? "" : String(c))));
  return { rows, firstDataRow: 2 };
}

/** Read the header row (A1:O1) exactly as it currently exists in the sheet. */
export async function readHeaderRow(): Promise<string[]> {
  const range = `'${SHEET_TAB}'!A1:O1`;
  const res = await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${encodeURI(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheets] readHeaderRow failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets header read failed [${res.status}]`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values?.[0] ?? []).map((c) => (c == null ? "" : String(c).trim()));
}

/** Append one row to the sheet. Returns the resulting 1-based row index. */
export async function appendRow(values: (string | number)[]): Promise<number> {
  const range = `'${SHEET_TAB}'!A1`;
  const res = await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${encodeURI(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
    {
      method: "POST",
      body: JSON.stringify({ values: [values] }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheets] appendRow failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets append failed [${res.status}]`);
  }
  const data = (await res.json()) as { updates?: { updatedRange?: string } };
  const updated = data.updates?.updatedRange ?? "";
  // e.g. "'GKHQ Propietry Data Hub'!A6:N6"
  const m = updated.match(/![A-Z]+(\d+):[A-Z]+\d+$/);
  return m ? Number(m[1]) : -1;
}

/** Look up the numeric sheetId (gid) for SHEET_TAB. Cached in-memory. */
let cachedSheetGid: number | null = null;
export async function getSheetGid(): Promise<number> {
  if (cachedSheetGid != null) return cachedSheetGid;
  const res = await gatewayFetch(
    `/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`,
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheets] getSheetGid failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets metadata read failed [${res.status}]`);
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  };
  const match = (data.sheets ?? []).find(
    (s) => s.properties?.title === SHEET_TAB,
  );
  if (!match?.properties || match.properties.sheetId == null) {
    throw new Error(`Sheet tab "${SHEET_TAB}" not found in spreadsheet.`);
  }
  cachedSheetGid = match.properties.sheetId;
  return cachedSheetGid;
}

/** Delete a single 1-based row from the sheet. */
export async function deleteRow(rowIndex: number): Promise<void> {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new Error(`Refusing to delete invalid row index ${rowIndex}.`);
  }
  const sheetId = await getSheetGid();
  const res = await gatewayFetch(
    `/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1, // 0-based, inclusive
                endIndex: rowIndex, // exclusive
              },
            },
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`[sheets] deleteRow failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets delete failed [${res.status}]`);
  }
}

