import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../../config";
import type { Catalog, Area } from "../../types";

let _catalog: Catalog | null = null;

export function load(): Catalog {
  if (_catalog === null) {
    _catalog = JSON.parse(
      readFileSync(join(DATA_DIR, "legal_areas.json"), "utf-8")
    ) as Catalog;
  }
  return _catalog;
}

export function optionsText(): string {
  const out: string[] = [];
  for (const a of load().areas) {
    for (const s of a.subareas) {
      out.push(`${s.id}\t${a.area} > ${s.name}`);
    }
  }
  return out.join("\n");
}

export function resolve(subareaId: string | null): Area | null {
  if (!subareaId) {
    return null;
  }
  for (const a of load().areas) {
    for (const s of a.subareas) {
      if (s.id === subareaId) {
        return {
          legal_area: a.area,
          subarea: s.name,
          legal_area_id: a.id,
          legal_subarea_id: s.id,
        };
      }
    }
  }
  return null;
}

export function defaultResolved(): Area {
  const cat = load();
  for (const a of cat.areas) {
    if (a.area === cat.default_area) {
      const s = a.subareas[0];
      return {
        legal_area: a.area,
        subarea: s.name,
        legal_area_id: a.id,
        legal_subarea_id: s.id,
      };
    }
  }
  return {
    legal_area: cat.default_area ?? "Derecho administrativo",
    subarea: "General",
    legal_area_id: null,
    legal_subarea_id: null,
  };
}
