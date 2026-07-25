import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  CANONICAL_BY_ALIAS,
  LEGAL_SOURCES,
  canonicalSource,
  isKnownSource,
  sourceByKey,
} from "./index";

/**
 * Huella COMPARTIDA del mapeo alias→canónico. La misma constante está fijada
 * en los tests de los tres repos:
 *  - scrapping:  src/services/sources/index.test.ts (este archivo)
 *  - assistant:  tests/test_legal_sources.py
 *  - platform:   src/__tests__/types/legal_documents/canonical_source.test.ts
 * Si cambias el catálogo de fuentes, este test falla: actualiza la huella EN
 * LOS TRES repos en el mismo cambio (así la divergencia nunca pasa CI).
 */
const SHARED_CATALOG_SHA256 =
  "858209ce0aaaafb0c1e3ae68fd4a8a250083d9482e87fa58f71a410062622e9c";

describe("catálogo canónico de fuentes", () => {
  it("mantiene la huella compartida con assistant y platform", () => {
    const sorted = [...CANONICAL_BY_ALIAS.keys()].sort();
    const json = JSON.stringify(
      Object.fromEntries(sorted.map((k) => [k, CANONICAL_BY_ALIAS.get(k)]))
    );
    const sha = createHash("sha256").update(json, "utf8").digest("hex");
    assert.equal(sha, SHARED_CATALOG_SHA256);
  });

  it("nunca usa una sigla como nombre canónico", () => {
    for (const source of LEGAL_SOURCES) {
      assert.match(source.canonicalName, /\s/);
      assert.notEqual(source.canonicalName, source.canonicalName.toUpperCase());
    }
  });

  it("todo alias registrado resuelve a su nombre canónico", () => {
    for (const source of LEGAL_SOURCES) {
      for (const alias of source.aliases) {
        assert.equal(canonicalSource(alias), source.canonicalName);
      }
    }
  });
});

describe("canonicalSource", () => {
  it("normaliza las siglas registradas", () => {
    assert.equal(canonicalSource("TC"), "Tribunal Constitucional");
    assert.equal(canonicalSource("tc"), "Tribunal Constitucional");
    assert.equal(canonicalSource("PJ"), "Poder Judicial");
    assert.equal(canonicalSource("pj"), "Poder Judicial");
    assert.equal(
      canonicalSource("SPIJ"),
      "Sistema Peruano de Información Jurídica"
    );
  });

  it("acepta nombres completos, con y sin tildes", () => {
    assert.equal(canonicalSource("Tribunal Constitucional"), "Tribunal Constitucional");
    assert.equal(canonicalSource("Poder Judicial"), "Poder Judicial");
    assert.equal(
      canonicalSource("Sistema Peruano de Información Jurídica"),
      "Sistema Peruano de Información Jurídica"
    );
    assert.equal(
      canonicalSource("sistema peruano de informacion juridica"),
      "Sistema Peruano de Información Jurídica"
    );
    assert.equal(canonicalSource("  poder   JUDICIAL "), "Poder Judicial");
  });

  it("deja pasar fuentes desconocidas sin inventar expansiones", () => {
    assert.equal(canonicalSource("OSCE"), "OSCE");
    assert.equal(canonicalSource("Fuente Rara XYZ"), "Fuente Rara XYZ");
    assert.equal(canonicalSource("   "), "");
  });

  it("isKnownSource distingue registradas de desconocidas", () => {
    assert.equal(isKnownSource("spij"), true);
    assert.equal(isKnownSource("Poder judicial"), true);
    assert.equal(isKnownSource("OSCE"), false);
  });

  it("sourceByKey falla ante una clave desconocida", () => {
    assert.equal(sourceByKey("tc").canonicalName, "Tribunal Constitucional");
    assert.throws(() => sourceByKey("no-existe"));
  });
});
