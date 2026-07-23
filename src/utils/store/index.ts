import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

import { nowTs } from "../time";

/**
 * Ledger + checkpoint genéricos, compartidos por todos los módulos de scraping.
 * El ledger es un `jsonl` append-only: una línea por documento, deduplicado por
 * `id` (el último gana). El checkpoint es un único JSON con la posición de
 * reanudación. Cada módulo aporta su propio tipo de registro (que debe tener
 * `id`) y define qué es la posición de reanudación (cursor SPIJ, hoja del árbol
 * PJ, etc.).
 */
export interface LedgerRecord {
  id: string;
}

export interface Checkpoint {
  [key: string]: number | string | null;
}

export function latestRecords<T extends LedgerRecord>(path: string): Map<string, T> {
  const latest = new Map<string, T>();
  if (!existsSync(path)) return latest;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as T;
      latest.set(rec.id, rec);
    } catch {
      // línea corrupta: se ignora (el ledger es append-only y tolerante a fallos)
    }
  }
  return latest;
}

export function appendRecord<T extends LedgerRecord>(path: string, record: T): void {
  appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
}

export function loadCheckpoint(path: string, key: string, def = 0): number {
  if (!existsSync(path)) return def;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const value = data[key];
    return typeof value === "number" ? value : def;
  } catch {
    return def;
  }
}

export function saveCheckpoint(
  path: string,
  key: string,
  cursor: number,
  total: number | null = null,
): void {
  const payload: Checkpoint = { [key]: cursor, total, ts: nowTs() };
  writeFileSync(path, JSON.stringify(payload), "utf-8");
}
