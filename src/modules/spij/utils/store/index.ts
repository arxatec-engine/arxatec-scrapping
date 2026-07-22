import * as shared from "../../../../utils/store";
import type { StoredRecord } from "../../types";

// Fachada tipada del ledger/checkpoint compartido (src/utils/store): fija el tipo
// de registro de SPIJ para que los call sites del módulo no pasen genéricos.
// loadCheckpoint / saveCheckpoint son genéricos y se reexportan tal cual.

export function latestRecords(path: string): Map<string, StoredRecord> {
  return shared.latestRecords<StoredRecord>(path);
}

export function appendRecord(path: string, record: StoredRecord): void {
  shared.appendRecord(path, record);
}

export const loadCheckpoint = shared.loadCheckpoint;
export const saveCheckpoint = shared.saveCheckpoint;
