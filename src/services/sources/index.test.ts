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
  "0c66730cd6bb5d819fc67e44933b0c0ee050befa83c6374928f709653b09bfd3";

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

  it("normaliza las siglas de la tanda P3 (2026-07-30)", () => {
    assert.equal(canonicalSource("RTF alias no, TF sí: TF"), "RTF alias no, TF sí: TF");
    assert.equal(canonicalSource("TF"), "Tribunal Fiscal");
    assert.equal(canonicalSource("OSCE"), "Tribunal de Contrataciones del Estado");
    assert.equal(canonicalSource("OECE"), "Tribunal de Contrataciones del Estado");
    assert.equal(canonicalSource("SUNARP"), "Tribunal Registral");
    assert.equal(canonicalSource("SERVIR"), "Tribunal del Servicio Civil");
    assert.equal(canonicalSource("OEFA"), "Tribunal de Fiscalización Ambiental");
    assert.equal(
      canonicalSource("SUNAT"),
      "Superintendencia Nacional de Aduanas y de Administración Tributaria"
    );
    assert.equal(
      canonicalSource("INDECOPI"),
      "Instituto Nacional de Defensa de la Competencia y de la Protección de la Propiedad Intelectual"
    );
  });

  it("deja pasar fuentes desconocidas sin inventar expansiones", () => {
    assert.equal(canonicalSource("Fuente Rara XYZ"), "Fuente Rara XYZ");
    assert.equal(canonicalSource("   "), "");
  });

  it("isKnownSource distingue registradas de desconocidas", () => {
    assert.equal(isKnownSource("spij"), true);
    assert.equal(isKnownSource("Poder judicial"), true);
    assert.equal(isKnownSource("Fuente Rara XYZ"), false);
  });

  it("sourceByKey falla ante una clave desconocida", () => {
    assert.equal(sourceByKey("tc").canonicalName, "Tribunal Constitucional");
    assert.throws(() => sourceByKey("no-existe"));
  });
});
