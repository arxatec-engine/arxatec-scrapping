/**
 * `pnpm verify <fuente> [limit]` — la señal mecánica de verificación.
 *
 * Corre el módulo con `--limit` (default 5) contra el assistant local y emite
 * un veredicto PASS/FAIL comparando el ledger antes y después:
 *   - FAIL si el módulo sale con error o si aparecen fallos permanentes nuevos.
 *   - PASS si ingestó ≥1 doc nuevo OK (o si no había nada nuevo: reanudación
 *     idempotente, se reporta como "al día").
 *
 * Exit codes: 0 = PASS · 1 = FAIL · 2 = uso/entorno (assistant caído, fuente
 * desconocida). Pensado para que un loop autónomo pueda leer la señal sin
 * interpretar logs.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

import { latestRecords, type LedgerRecord } from "../src/utils/store";

interface FilaLedger extends LedgerRecord {
  ingest?: { done?: boolean; ok?: boolean; warning?: string };
}

interface Conteo {
  total: number;
  ok: number;
  pendientes: number;
  permanentes: number;
  warnings: number;
}

/** Mismo mapa fuente→ledger que usa `pnpm status` (pj es el único irregular). */
const LEDGERS: Record<string, string> = {
  spij: "state/spij_ingest/ledger.jsonl",
  pj: "state/pj_jurisprudencia/ledger.jsonl",
  tc: "state/tc_ingest/ledger.jsonl",
  tfiscal: "state/tfiscal_ingest/ledger.jsonl",
  indecopi: "state/indecopi_ingest/ledger.jsonl",
  tce: "state/tce_ingest/ledger.jsonl",
  sunarp: "state/sunarp_ingest/ledger.jsonl",
  servir: "state/servir_ingest/ledger.jsonl",
  oefa: "state/oefa_ingest/ledger.jsonl",
  osinergmin: "state/osinergmin_ingest/ledger.jsonl",
  osiptel: "state/osiptel_ingest/ledger.jsonl",
  sunass: "state/sunass_ingest/ledger.jsonl",
  ositran: "state/ositran_ingest/ledger.jsonl",
  gobpe: "state/gobpe_ingest/ledger.jsonl",
  sunat: "state/sunat_ingest/ledger.jsonl",
  spley: "state/spley_ingest/ledger.jsonl",
  doctrina: "state/doctrina_ingest/ledger.jsonl",
  elperuano: "state/elperuano_ingest/ledger.jsonl",
};

function contar(ledgerPath: string): Conteo {
  const c: Conteo = { total: 0, ok: 0, pendientes: 0, permanentes: 0, warnings: 0 };
  let filas: Map<string, FilaLedger>;
  try {
    filas = latestRecords<FilaLedger>(ledgerPath);
  } catch {
    return c;
  }
  for (const fila of filas.values()) {
    c.total += 1;
    const ing = fila.ingest;
    if (!ing || !ing.done) c.pendientes += 1;
    else if (ing.ok) c.ok += 1;
    else c.permanentes += 1;
    if (ing?.warning) c.warnings += 1;
  }
  return c;
}

async function assistantArriba(baseUrl: string): Promise<boolean> {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const fuente = process.argv[2];
  const limit = process.argv[3] ?? "5";
  if (!fuente || !(fuente in LEDGERS)) {
    console.error(
      `uso: pnpm verify <fuente> [limit]\nfuentes: ${Object.keys(LEDGERS).join(", ")}`
    );
    process.exit(2);
  }

  const baseUrl = process.env.INGEST_BASE_URL;
  if (!baseUrl) {
    console.error("[verify] Falta INGEST_BASE_URL en .env — no hay backend contra el cual verificar.");
    process.exit(2);
  }
  if (!(await assistantArriba(baseUrl))) {
    console.error(
      `[verify] El assistant no responde en ${baseUrl}. Levántalo antes del smoke ` +
        "(y recuerda: si quedó un uvicorn zombi, los hijos retienen :8000 — `ss -tlnp`)."
    );
    process.exit(2);
  }

  const ledger = LEDGERS[fuente];
  const antes = contar(ledger);
  console.log(`[verify] ${fuente} --limit ${limit} · ledger previo: ${antes.ok} ok / ${antes.permanentes} permanentes`);

  const corrida = spawnSync("pnpm", [fuente, "--limit", limit], { stdio: "inherit" });

  const despues = contar(ledger);
  const nuevosOk = despues.ok - antes.ok;
  const nuevosPerm = despues.permanentes - antes.permanentes;
  const nuevosWarn = despues.warnings - antes.warnings;

  console.log(
    `[verify] delta: +${nuevosOk} ok · +${nuevosPerm} permanentes · +${nuevosWarn} warnings ` +
      `(total ${despues.total}, pendientes ${despues.pendientes})`
  );

  if (corrida.status !== 0) {
    console.error(`[verify] FAIL — el módulo salió con código ${corrida.status ?? "señal"}.`);
    process.exit(1);
  }
  if (nuevosPerm > 0) {
    console.error(`[verify] FAIL — ${nuevosPerm} documento(s) con fallo permanente nuevo. Revisa state/ y el log.`);
    process.exit(1);
  }
  if (nuevosOk > 0) {
    console.log(`[verify] PASS — ${nuevosOk} documento(s) ingestados OK.`);
  } else {
    console.log("[verify] PASS (al día) — nada nuevo que ingestar; la reanudación es idempotente.");
  }
}

void main();
