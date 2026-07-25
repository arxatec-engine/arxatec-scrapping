import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { entityByAcronym, load, normalize } from "./index";

const DATA_DIR = join(process.cwd(), "public", "data");
const idx = load(
  join(DATA_DIR, "groups.json"),
  join(DATA_DIR, "subgroups.json"),
  join(DATA_DIR, "entity.json")
);

interface CatalogRow {
  id: string;
  name: string;
  acronym: string | null;
}

const catalog = JSON.parse(
  readFileSync(join(DATA_DIR, "entity.json"), "utf-8")
) as CatalogRow[];

describe("catálogo de entidades", () => {
  it("registra la sigla PRODUCE exactamente una vez y en el Ministerio de la Producción", () => {
    const withProduce = catalog.filter(
      (e) => normalize(e.acronym ?? "") === "PRODUCE"
    );
    assert.equal(withProduce.length, 1);
    assert.equal(withProduce[0].name, "Ministerio de la Producción");
    assert.equal(withProduce[0].id, "7ced3ddf-6ba1-460d-b40b-b62243813249");
  });
});

describe("entityByAcronym (emisor por sigla única del sector)", () => {
  it("PRODUCE resuelve al Ministerio de la Producción sin depender de gob.pe", () => {
    const hit = entityByAcronym(idx, "PRODUCE");
    assert.ok(hit);
    assert.equal(hit.entity_name, "Ministerio de la Producción");
    assert.equal(hit.entity_id, "7ced3ddf-6ba1-460d-b40b-b62243813249");
  });

  it("ignora mayúsculas y minúsculas", () => {
    assert.equal(
      entityByAcronym(idx, "produce")?.entity_name,
      "Ministerio de la Producción"
    );
  });

  it("una sigla desconocida no matchea", () => {
    assert.equal(entityByAcronym(idx, "SIGLA-QUE-NO-EXISTE"), null);
  });

  it("una sigla ambigua (repetida en el catálogo) no matchea", () => {
    const counts = new Map<string, string[]>();
    for (const e of catalog) {
      const key = normalize(e.acronym ?? "");
      if (key) {
        counts.set(key, [...(counts.get(key) ?? []), e.name]);
      }
    }
    const ambiguous = [...counts.entries()].filter(([, names]) => names.length > 1);
    assert.ok(ambiguous.length > 0, "el catálogo real tiene siglas repetidas");
    for (const [acronym] of ambiguous.slice(0, 5)) {
      assert.equal(entityByAcronym(idx, acronym), null);
    }
  });
});
