// Applies supabase/migrations/*.sql to the database in order, once each.
// Usage: node scripts/migrate.mjs   (reads POSTGRES_URL_NON_POOLING or DATABASE_URL
// from the environment or from .env.local / .env.production.local)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env.local", ".env.production.local", ".env"]) {
  const full = path.join(root, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!rawUrl) {
  console.error("No database URL. Set POSTGRES_URL_NON_POOLING or DATABASE_URL.");
  process.exit(1);
}

// pg treats sslmode=require as verify-full; Supabase uses its own CA, so strip it
// and request TLS without CA verification instead.
const url = new URL(rawUrl);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");
const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

await client.connect();
await client.query(`create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);
await client.query("alter table public.schema_migrations enable row level security");

const dir = path.join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const { rows } = await client.query("select name from public.schema_migrations");
const applied = new Set(rows.map((r) => r.name));

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip   ${file}`);
    continue;
  }
  const sql = readFileSync(path.join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`apply  ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`failed ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Migrations complete.");
