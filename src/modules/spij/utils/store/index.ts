import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

import type { StoredRecord, Checkpoint } from "../../types";
import { nowTs } from "@/utils/time";

export function latestRecords(path: string): Map<string, StoredRecord> {
  const latest = new Map<string, StoredRecord>();
  if (!existsSync(path)) return latest;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as StoredRecord;
      latest.set(rec.id, rec);
    } catch {

    }
  }
  return latest;
}

export function appendRecord(path: string, record: StoredRecord): void {
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
