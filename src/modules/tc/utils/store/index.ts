import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import { nowTs } from "../../../../utils/time";
import type { StoredRecord, TcCheckpoint } from "../../types";

export function latestRecords(path: string): Map<string, StoredRecord> {
  const latest = new Map<string, StoredRecord>();
  if (!existsSync(path)) return latest;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as StoredRecord;
      latest.set(rec.id, rec);
    } catch {
      // línea corrupta: la ignoramos y seguimos.
    }
  }
  return latest;
}

export function appendRecord(path: string, record: StoredRecord): void {
  appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
}

export function loadCheckpoint(path: string): TcCheckpoint | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<TcCheckpoint>;
    if (typeof data.month === "string" && typeof data.page === "number") {
      return {
        month: data.month,
        page: data.page,
        total_agregados: data.total_agregados ?? null,
        ts: data.ts ?? nowTs(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCheckpoint(
  path: string,
  month: string,
  page: number,
  totalAgregados: number | null = null
): void {
  const payload: TcCheckpoint = {
    month,
    page,
    total_agregados: totalAgregados,
    ts: nowTs(),
  };
  writeFileSync(path, JSON.stringify(payload), "utf-8");
}
