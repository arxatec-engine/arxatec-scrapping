/**
 * Contrato entre lenguajes: los ids y el texto que produce esta ingesta tienen
 * que ser los MISMOS que produce la del assistant en Python.
 *
 * Los valores esperados no están inventados: se generaron ejecutando el código
 * Python real (`uuid.uuid5(uuid.NAMESPACE_URL, ...)` y `normalize_title`) el
 * 2026-08-07. Si alguien cambia la cadena que se hashea, este test cae — y debe
 * caer, porque el mismo documento acabaría con dos identidades distintas según
 * quién lo ingiera.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChunkHeader, dateToTimestamp } from "./chunk";
import { buildDocumentId, buildPointIds } from "./ids";
import { normalizeTitle } from "./index";
import type { ResolvedMetadata } from "./types";

const URL_EJEMPLO =
  "https://busquedas.elperuano.pe/normaslegales/ejemplo-123.pdf";

// Generado con Python: uuid5(NAMESPACE_URL, f"legal_document:PE:{URL}")
const DOC_ID_PYTHON = "46f00405-33fe-550c-acc0-17491b51cbfc";

// Generado con Python: uuid5(NAMESPACE_URL, f"legal_documents_v2:{doc}:{i}")
const PUNTOS_PYTHON = [
  "a543f184-813e-5ff6-bcc1-8c8082aad498",
  "f7c55bbd-3018-5391-a74c-ab3b6545e121",
  "f061b030-71b4-5aa9-a99b-e4e4d2e14924",
];

test("el document_id coincide con el que calcula el assistant", () => {
  assert.equal(buildDocumentId("PE", URL_EJEMPLO), DOC_ID_PYTHON);
});

test("el país se normaliza a mayúsculas antes de hashear", () => {
  assert.equal(buildDocumentId("pe", URL_EJEMPLO), DOC_ID_PYTHON);
  assert.equal(buildDocumentId(" Pe ", URL_EJEMPLO), DOC_ID_PYTHON);
});

test("sin source_url cae a un id aleatorio, no a uno fijo", () => {
  const a = buildDocumentId("PE", null);
  const b = buildDocumentId("PE", null);
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test("los ids de punto coinciden con los del assistant", () => {
  assert.deepEqual(buildPointIds(DOC_ID_PYTHON, 3), PUNTOS_PYTHON);
});

test("re-ingestar produce los mismos ids de punto (upsert, no duplicado)", () => {
  assert.deepEqual(buildPointIds(DOC_ID_PYTHON, 3), buildPointIds(DOC_ID_PYTHON, 3));
});

test("normalizeTitle replica normalize_title de Python", () => {
  assert.equal(
    normalizeTitle("  Resolución  N.° 123-2024-SUNAFIL/TFL  "),
    "resolucion n.° 123-2024-sunafil/tfl"
  );
});

test("las fechas se convierten a timestamp UTC a medianoche", () => {
  // 2024-05-14T00:00:00Z
  assert.equal(dateToTimestamp("2024-05-14"), 1715644800);
  assert.equal(dateToTimestamp("2024-05-14T13:45:00"), 1715644800);
  assert.equal(dateToTimestamp(null), null);
  assert.equal(dateToTimestamp(""), null);
});

function metadataDe(extra: Partial<ResolvedMetadata>): ResolvedMetadata {
  return {
    country: "PE",
    type: "jurisprudence",
    title: "Resolución de Sala Plena",
    document_number: "001-2024",
    jurisdiction: "PE",
    legal_area: "Derecho laboral",
    subarea: "Fiscalización",
    legal_area_id: null,
    legal_subarea_id: null,
    source: "tfl",
    source_url: URL_EJEMPLO,
    status: "Vigente",
    version: 1,
    language: "es",
    published_at: "2024-05-14",
    effective_date: "2024-05-14",
    keywords: [],
    concepts: [],
    references: [],
    document_id: DOC_ID_PYTHON,
    key: null,
    normalized_title: "resolucion de sala plena",
    resolved_effective_date: "2024-05-14",
    created_at: new Date(0),
    updated_at: new Date(0),
    ...extra,
  };
}

test("la cabecera del chunk lleva el orden y las etiquetas del assistant", () => {
  const header = buildChunkHeader(
    metadataDe({ citation: "Res. 001-2024", issued_at: "2024-05-14" }),
    "SUNAFIL"
  );

  assert.equal(
    header,
    [
      "Tipo: jurisprudence",
      "Título: Resolución de Sala Plena",
      "Cita: Res. 001-2024",
      "Número: 001-2024",
      "Fecha: 2024-05-14",
      "Entidad emisora: SUNAFIL",
      "Área legal: Derecho laboral",
      "Subárea legal: Fiscalización",
    ].join("\n")
  );
});

test("las filas opcionales de la cabecera se omiten si no hay dato", () => {
  const header = buildChunkHeader(
    metadataDe({ citation: null, document_number: null, subarea: "" }),
    null
  );

  assert.equal(
    header,
    [
      "Tipo: jurisprudence",
      "Título: Resolución de Sala Plena",
      "Fecha: 2024-05-14",
      "Área legal: Derecho laboral",
    ].join("\n")
  );
});

test("sala y procedencia aparecen cuando el módulo las envía", () => {
  const header = buildChunkHeader(
    metadataDe({ court_chamber: "Sala Plena", origin_district: "Lima Norte" }),
    "SUNAFIL"
  );

  assert.ok(header.includes("Sala: Sala Plena"));
  assert.ok(header.includes("Procedencia: Lima Norte"));
});
