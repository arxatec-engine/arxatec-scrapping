import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeCp850, fechaIso, parseRows, tokenize } from "./index";
import type { Logger } from "../../../../types";

const log: Logger = { info: () => {}, warn: () => {}, error: () => {} };

const HEADER =
  "Fecha Publicación,OP,Entidad,Dispositivo,Número,Sumilla,Link,Fecha Corte,,,\n";

test("decodeCp850 mapea los bytes reales del dataset", () => {
  // "Publicaci¢n" y "N£mero" leídos como latin-1; en CP850: ó, ú, °, é, ñ, á.
  const bytes = Uint8Array.from([0xa2, 0xa3, 0xf8, 0x82, 0xa4, 0xa0]);
  assert.equal(decodeCp850(bytes), "óú°éñá");
});

test("fechaIso convierte DD/MM/YYYY y rechaza lo demás", () => {
  assert.equal(fechaIso("28/02/2025"), "2025-02-28");
  assert.equal(fechaIso("2025-02-28"), null);
  assert.equal(fechaIso(""), null);
});

test("tokenize respeta comillas con comas y saltos de línea (casos reales)", () => {
  const rows = tokenize('a,"b, c",d\ne,"f\ng",h\n');
  assert.deepEqual(rows, [
    ["a", "b, c", "d"],
    ["e", "f\ng", "h"],
  ]);
});

test("parseRows: fila simple con relleno", () => {
  const csv =
    HEADER +
    "28/02/2025,2375814-1,PRESIDENCIA DEL CONSEJO DE MINISTROS,RESOLUCION MINISTERIAL," +
    "N° 042-2025-PCM,Aprueban el Plan Anual,https://busquedas.elperuano.pe/dispositivo/NL/2375814-1,28/02/2025,,,\n";
  const [doc] = parseRows(csv, log);
  assert.equal(doc.op, "2375814-1");
  assert.equal(doc.publishedAt, "2025-02-28");
  assert.equal(doc.entidad, "PRESIDENCIA DEL CONSEJO DE MINISTROS");
  assert.equal(doc.dispositivo, "RESOLUCION MINISTERIAL");
  assert.equal(doc.numero, "N° 042-2025-PCM");
  assert.equal(doc.sumilla, "Aprueban el Plan Anual");
});

test("parseRows: entidad entrecomillada con coma (caso SBS real)", () => {
  const csv =
    HEADER +
    '28/02/2025,2371324-1,"SUPERINTENDENCIA DE BANCA, SEGUROS",RESOLUCION,' +
    "SBS N° 00459-2025,Autorizan la organización,https://x/y,28/02/2025,,\n";
  const [doc] = parseRows(csv, log);
  assert.equal(doc.entidad, "SUPERINTENDENCIA DE BANCA, SEGUROS");
  assert.equal(doc.numero, "SBS N° 00459-2025");
  assert.equal(doc.sumilla, "Autorizan la organización");
});

test("parseRows: sumilla entrecomillada multilínea queda en una línea", () => {
  const csv =
    HEADER +
    '05/02/2025,2368525-5,RELACIONES EXTERIORES,RESOLUCION SUPREMA,N° 020-2025-RE,"Delegan\nel Memorando",https://x/y,05/02/2025,,\n';
  const [doc] = parseRows(csv, log);
  assert.equal(doc.sumilla, "Delegan el Memorando");
});

test("parseRows: sumilla SIN comillas con coma se re-une por el ancla del Link", () => {
  const csv =
    HEADER +
    "05/02/2025,2368525-6,SALUD,RESOLUCION,N° 1,Aprueban a, b y c,https://x/y,05/02/2025,,\n";
  const [doc] = parseRows(csv, log);
  assert.equal(doc.sumilla, "Aprueban a, b y c");
});

test("parseRows: filas sin OP válido o sin Link se saltan", () => {
  const csv = HEADER + "texto suelto sin estructura\n28/02/2025,no-es-op,X,Y,Z,S,https://x,f,,\n";
  assert.equal(parseRows(csv, log).length, 0);
});
