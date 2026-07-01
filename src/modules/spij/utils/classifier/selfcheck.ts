import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { attachSectors, classify, load } from "./index";
import type { IndexEntity, SectorRaw } from "../../types";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "public", "data");
const paths = [
  join(DATA, "groups.json"),
  join(DATA, "subgroups.json"),
  join(DATA, "entity.json"),
] as const;

function pickTarget(idxExact: Record<string, IndexEntity>): [string, IndexEntity] {
  for (const [norm, rec] of Object.entries(idxExact)) {
    if (rec.subgroup_id && norm.includes(" ")) return [norm, rec];
  }
  throw new Error("no hay entidad con subgroup_id y nombre multi-token en los datos");
}

const HOJA = "ZZX UNIDAD INEXISTENTE 9999";

const a = load(...paths);
const [, target] = pickTarget(a.exact);
assert.equal(
  classify(a, HOJA).match_confidence,
  "unmatched",
  "sin catálogo, una hoja desconocida debe quedar unmatched"
);

const b = load(...paths);
const sectores: SectorRaw[] = [
  { nombre: HOJA, padre: target.name, esPadre: "2" },
  { nombre: target.name, padre: null, esPadre: "1" },
];
attachSectors(b, sectores);
const viaPadre = classify(b, HOJA);
assert.equal(viaPadre.entity_id, target.id, "debe heredar el UUID del padre");
assert.equal(viaPadre.match_confidence, "fuzzy", "atribución al padre = fuzzy");
assert.ok(viaPadre.subgroup_id, "debe arrastrar subgroup/group del padre");

const exact = classify(b, target.name);
assert.equal(exact.entity_id, target.id);
assert.equal(exact.match_confidence, "exact", "el match exacto no debe cambiar");

console.log("OK classifier self-check — peldaño padre resuelve a %s", target.name);
