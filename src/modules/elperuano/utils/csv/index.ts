import type { Doc } from "../../types";
import type { Logger } from "../../../../types";

/**
 * Los CSV de "Dispositivos Legales" vienen en CP850 (la página de códigos DOS
 * hispana): leídos como latin-1 muestran "Publicaci¢n" (¢=ó), "N£mero" (£=ú),
 * "Nø" (ø=°). Node no trae CP850 en TextDecoder, así que la tabla alta
 * (0x80–0xFF) va explícita. ASCII (<0x80) pasa directo.
 */
const CP850_HIGH =
  "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" +
  "áíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" +
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" +
  "­±‗¾¶§÷¸°¨·¹³²■ ";

export function decodeCp850(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80];
  }
  return out;
}

/** DD/MM/YYYY del CSV → ISO YYYY-MM-DD (null si no parsea). */
export function fechaIso(value: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Tokenizador RFC4180: campos entre comillas pueden contener comas, comillas
 * escapadas ("") y SALTOS DE LÍNEA (verificado en el dataset real: entidades
 * como "SUPERINTENDENCIA DE BANCA, SEGUROS..." y sumillas partidas en dos
 * líneas). Por eso no vale un split por líneas.
 */
export function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const OP_RE = /^\d+-\d+$/;

/**
 * Filas del CSV → Doc[]. Columnas: Fecha Publicación, OP, Entidad,
 * Dispositivo, Número, Sumilla, Link, Fecha Corte, relleno…
 * Tras tokenizar aún quedan sumillas SIN comillas que contienen comas, así que
 * la sumilla se re-une anclando el campo `Link` (empieza con http). Filas que
 * no calzan (OP inválido o sin Link) se saltan con warning: mejor perder una
 * fila rara que ingestar metadata corrida.
 */
export function parseRows(text: string, log: Logger): Doc[] {
  const docs: Doc[] = [];
  let malformadas = 0;
  const rows = tokenize(text);
  for (let i = 1; i < rows.length; i++) {
    const f = rows[i];
    if (f.every((c) => !c.trim())) continue;
    const op = (f[1] ?? "").trim();
    const linkIdx = f.findIndex((c) => c.trim().startsWith("http"));
    if (!OP_RE.test(op) || linkIdx < 5) {
      malformadas += 1;
      if (malformadas <= 5) {
        log.warn("Fila %d del CSV no calza, se salta: %s", i + 1, f.join(",").slice(0, 120));
      }
      continue;
    }
    docs.push({
      op,
      publishedAt: fechaIso(f[0]),
      entidad: (f[2] ?? "").trim(),
      dispositivo: (f[3] ?? "").trim(),
      numero: (f[4] ?? "").trim() || null,
      // Las sumillas entrecomilladas pueden traer saltos de línea internos:
      // colapsados a espacio para que título y cita queden en una línea.
      sumilla: f.slice(5, linkIdx).join(",").replace(/\s+/g, " ").trim(),
    });
  }
  if (malformadas > 5) log.warn("…y %d filas malformadas más.", malformadas - 5);
  return docs;
}
