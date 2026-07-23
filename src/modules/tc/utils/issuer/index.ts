import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../../config";

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve el UUID de la entidad emisora (Tribunal Constitucional) contra
 * public/data/entity.json por nombre exacto normalizado. Devuelve null si no
 * está en el catálogo (la ingesta seguirá, solo sin `issuer_entity_ids`).
 */
export function resolveIssuer(name: string): string | null {
  const raw = JSON.parse(
    readFileSync(join(DATA_DIR, "entity.json"), "utf-8")
  ) as unknown;
  const list: any[] = Array.isArray(raw)
    ? raw
    : (raw as { data?: any[] })?.data ?? [];
  const target = normalize(name);
  for (const e of list) {
    if (normalize(e?.name) === target) {
      return e?.id != null ? String(e.id) : null;
    }
  }
  return null;
}
