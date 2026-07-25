import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../../config";
import type { AreaResolved, Issuer, PjIndex } from "../../types";

/** Normaliza un nombre a MAYÚSCULAS sin acentos ni signos (para comparar). */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface EntityRow {
  id: string;
  name: string;
}
interface SubareaRow {
  id: string;
  name: string;
}
interface AreaRow {
  id: string;
  area: string;
  subareas: SubareaRow[];
}
interface AreaCatalog {
  default_area?: string;
  areas: AreaRow[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8")) as T;
}

function readEntities(): EntityRow[] {
  const raw = readJson<EntityRow[] | { data: EntityRow[] }>("entity.json");
  return Array.isArray(raw) ? raw : raw.data;
}

/**
 * Materia (del breadcrumb del árbol PJ) -> nombre de área del catálogo cerrado.
 * Se evalúa en orden; gana la primera que aparezca en el breadcrumb. Más
 * específicas primero (control difuso, contencioso, previsional) para que no las
 * capture una regla general (constitucional, administrativo, laboral).
 */
const MATERIA_TO_AREA: Array<[RegExp, string]> = [
  [/CONTROL DIFUSO/, "Derecho constitucional"],
  [/CONTENCIOSO|ADMINISTRATIV/, "Derecho administrativo"],
  [/TRIBUTARI/, "Derecho tributario"],
  [/CONSTITUCIONAL/, "Derecho constitucional"],
  [/PREVISIONAL/, "Derecho previsional y de seguridad social"],
  [/LABORAL/, "Derecho laboral"],
  [/PENAL/, "Derecho penal"],
  [/FAMILIA|CIVIL/, "Derecho civil"],
];

export function buildIndex(): PjIndex {
  const entities = readEntities();

  const findEntityId = (name: string): string | null => {
    const key = normalizeName(name);
    const hit = entities.find((e) => normalizeName(e.name) === key);
    return hit ? hit.id : null;
  };

  const issuer: Issuer = {
    issuerId: findEntityId("Poder Judicial"),
    courtId: findEntityId("Corte Suprema de Justicia de la República"),
  };

  const catalog = readJson<AreaCatalog>("legal_areas.json");
  const areaIdByName = new Map<string, string>();
  for (const a of catalog.areas) {
    areaIdByName.set(normalizeName(a.area), a.id);
  }

  const defName = catalog.default_area ?? "Derecho administrativo";
  const defaultArea: AreaResolved = {
    legal_area: defName,
    subarea: "General",
    legal_area_id: areaIdByName.get(normalizeName(defName)) ?? null,
    legal_subarea_id: null,
  };

  return { issuer, areaIdByName, defaultArea };
}

/**
 * Área legal de una hoja: la materia la da el árbol del PJ (breadcrumb), no la
 * IA — es la fuente más fiable, ya la clasificó el propio Poder Judicial. La
 * subárea es el tema de la hoja ("Posesión Precaria"); no está en el catálogo
 * cerrado, así que `legal_subarea_id` queda null.
 */
export function resolveArea(
  idx: PjIndex,
  breadcrumb: string[],
  tema: string | null,
): AreaResolved {
  const hay = normalizeName(breadcrumb.join(" "));
  const subarea = (tema ?? breadcrumb[breadcrumb.length - 1] ?? "").trim();

  for (const [rx, areaName] of MATERIA_TO_AREA) {
    if (rx.test(hay)) {
      return {
        legal_area: areaName,
        subarea: subarea || "General",
        legal_area_id: idx.areaIdByName.get(normalizeName(areaName)) ?? null,
        legal_subarea_id: null,
      };
    }
  }

  return { ...idx.defaultArea, subarea: subarea || idx.defaultArea.subarea };
}
