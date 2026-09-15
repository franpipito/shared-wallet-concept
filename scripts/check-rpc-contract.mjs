/**
 * Contrasta cada `client.rpc("fn", { p_x: ... })` del adapter de Supabase
 * contra la firma real en supabase/migrations. Un typo acá no lo detecta ni
 * TypeScript ni el build: recién falla en runtime contra la base.
 */
import { readFileSync, readdirSync } from "node:fs";

const sql = readdirSync("supabase/migrations")
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

// Firmas: create or replace function public.NOMBRE( ...params... )
const signatures = new Map();
const fnRe = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*\n?returns/gi;
for (const m of sql.matchAll(fnRe)) {
  const params = [...m[2].matchAll(/(?:^|,)\s*(p_\w+)/g)].map((p) => p[1]);
  signatures.set(m[1], new Set(params));
}

const adapter = readFileSync("lib/data/supabase-adapter.ts", "utf8");
const callRe = /client\.rpc\(\s*"(\w+)"\s*(?:,\s*\{([\s\S]*?)\}\s*)?\)/g;

let problems = 0;
const seen = new Set();
for (const m of adapter.matchAll(callRe)) {
  const [, fn, argsBlock = ""] = m;
  seen.add(fn);
  const args = [...argsBlock.matchAll(/(p_\w+)\s*:/g)].map((a) => a[1]);

  if (!signatures.has(fn)) {
    console.log(`✗ ${fn}: no existe en las migraciones`);
    problems++;
    continue;
  }
  const expected = signatures.get(fn);
  const unknown = args.filter((a) => !expected.has(a));
  if (unknown.length) {
    console.log(`✗ ${fn}: parámetros inexistentes -> ${unknown.join(", ")}`);
    console.log(`   la función acepta: ${[...expected].join(", ") || "(ninguno)"}`);
    problems++;
  } else {
    console.log(`✓ ${fn}(${args.join(", ") || ""})`);
  }
}

// Las columnas que el adapter mapea deben existir en los RETURNS TABLE.
const returnsBlocks = [...sql.matchAll(/returns\s+table\s*\(([\s\S]*?)\n\)/gi)]
  .map((m) => m[1]).join(",");
for (const col of ["total_deposited", "member_count", "inviter_name", "my_role", "my_status"]) {
  const ok = new RegExp(`\\b${col}\\b`).test(returnsBlocks);
  console.log(`${ok ? "✓" : "✗"} columna devuelta: ${col}`);
  if (!ok) problems++;
}

console.log(problems === 0 ? "\n✅ adapter y SQL coinciden" : `\n❌ ${problems} discrepancia(s)`);
process.exit(problems === 0 ? 0 : 1);
