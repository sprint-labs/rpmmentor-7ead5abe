import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = path.join(root, "supabase", "migrations");
const manifestPath = path.join(root, "docs", "supabase-production-migration-manifest.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const productionMigrations = manifest.production.migrations;
const reviewedForwardMigrations = manifest.reviewed_forward_migrations ?? [];
const expected = [...productionMigrations, ...reviewedForwardMigrations];
const expectedNames = new Set(expected.map((entry) => `${entry.version}_${entry.name}.sql`));
const activeNames = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
const lastProductionVersion = productionMigrations.at(-1)?.version ?? "";
const errors = [];

if (manifest.production.ledger_rows !== productionMigrations.length) {
  errors.push(
    `Production ledger count mismatch: manifest says ${manifest.production.ledger_rows}, but lists ${productionMigrations.length}`,
  );
}

for (const entry of reviewedForwardMigrations) {
  if (entry.version <= lastProductionVersion) {
    errors.push(
      `Reviewed forward migration is not newer than production: ${entry.version}_${entry.name}.sql`,
    );
  }
}

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

for (const entry of expected) {
  const filename = `${entry.version}_${entry.name}.sql`;
  if (!activeNames.includes(filename)) {
    errors.push(`Missing production migration: ${filename}`);
    continue;
  }

  const bytes = await readFile(path.join(migrationDir, filename));
  let comparable = bytes;

  // apply_patch and common editors preserve a terminal newline. Some ledger
  // statements did not have one, so ignore exactly one editor-added LF only
  // when the manifest's authoritative character length proves that is the
  // delta. PostgreSQL length(text) counts characters, not UTF-8 bytes.
  if (
    md5(bytes) !== entry.sql_md5 &&
    bytes.toString("utf8").length === entry.sql_length + 1 &&
    bytes.at(-1) === 0x0a
  ) {
    comparable = bytes.subarray(0, -1);
  }

  if (
    comparable.toString("utf8").length !== entry.sql_length ||
    md5(comparable) !== entry.sql_md5
  ) {
    errors.push(`SQL hash mismatch: ${filename}`);
  }
}

for (const filename of activeNames) {
  if (!expectedNames.has(filename)) {
    errors.push(`Unexpected or unreviewed migration: ${filename}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const suffix = reviewedForwardMigrations.length
    ? `; ${reviewedForwardMigrations.length} reviewed forward migration(s)`
    : "; no reviewed forward migrations";
  console.log(`Verified ${productionMigrations.length} production migrations${suffix}.`);
}
