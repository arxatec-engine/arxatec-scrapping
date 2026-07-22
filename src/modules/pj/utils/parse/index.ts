import { load } from "cheerio";

import { toIsoDate } from "../../../../utils/time";
import type { PjDoc } from "../../types";

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y);
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${p(mo)}-${p(d)}`;
}

/**
 * Parsea las fechas del PJ, que aparecen en formatos inconsistentes según la
 * hoja: "Oct 26, 2020" (mes en inglés), "26-ene-2012" (mes en español), ISO o
 * dd/mm/aaaa. Devuelve ISO YYYY-MM-DD (lo que exige el ingest) o null.
 */
export function parsePjDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // "Mmm DD, YYYY"  (ej. "Oct 26, 2020")
  let m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  // "DD-mmm-YYYY" o "DD mmm YYYY"  (ej. "26-ene-2012")
  m = /^(\d{1,2})[-\s]([A-Za-z]{3,})\.?[-\s](\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[1]);
  }

  // ISO, YYYY/MM/DD, DD/MM/YYYY
  return toIsoDate(s);
}

// Nº de recurso/expediente: número seguido de guion y año (19xx/20xx). Es la
// firma que distingue una fila de sentencia real de los PDF de "chrome" del
// portal (pie de página "Protección de Datos", manuales, etc.), que también
// usan `.pdf?MOD=AJPERES` pero NO están en una fila con recurso.
const RECURSO_RE = /\b\d{1,6}\s*[-–]\s*(?:19|20)\d{2}\b/;

/**
 * Extrae las filas de sentencias de una página hoja. Cada documento tiene un
 * enlace a PDF con el patrón WCM `.pdf?MOD=AJPERES` (filtramos imágenes/logos
 * `.jpg`). Una fila cuenta como sentencia solo si alguna celda tiene un nº de
 * recurso (número-año); así se descartan los PDF de pie de página / navegación
 * del portal. La estructura de columnas varía por sección (en Control Difuso la
 * 3a columna es la norma inaplicada, no la Sala), así que la fecha se localiza
 * parseando las celdas y el resto se asigna por posición. Dedup por URL de PDF.
 */
export function parseLeafDocs(html: string): PjDoc[] {
  const $ = load(html);
  const byPdf = new Map<string, PjDoc>();

  $('a[href*="MOD=AJPERES"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!/\.pdf\?MOD=AJPERES/i.test(href)) return; // solo PDFs de documento
    if (byPdf.has(href)) return;

    const $row = $(a).closest("tr");
    if (!$row.length) return;

    const cells = $row
      .children("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    const texts = cells.filter((c) => c.length > 0);

    // Debe existir una celda con nº de recurso, o no es una fila de sentencia.
    const recursoCell = texts.find((t) => RECURSO_RE.test(t));
    if (!recursoCell) return;
    const recurso = RECURSO_RE.exec(recursoCell)?.[0] ?? recursoCell;

    let fecha: string | null = null;
    let fechaCell: string | null = null;
    for (let i = texts.length - 1; i >= 0; i--) {
      const d = parsePjDate(texts[i]);
      if (d) {
        fecha = d;
        fechaCell = texts[i];
        break;
      }
    }

    const others = texts.filter((t) => t !== recursoCell && t !== fechaCell);

    byPdf.set(href, {
      recurso,
      distrito: others[0] ?? null,
      sala: others[1] ?? null,
      fecha,
      pdfUrl: href,
    });
  });

  return [...byPdf.values()];
}

/** Lee "Página X de Y" de una hoja; por defecto {1,1} si no hay paginación. */
export function parsePageInfo(html: string): { current: number; total: number } {
  const text = load(html).root().text();
  const m = /P[aá]gina\s+(\d+)\s+de\s+(\d+)/i.exec(text);
  if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  return { current: 1, total: 1 };
}

/**
 * Enlace a la página siguiente de una hoja paginada. El PORTLET_ID del parámetro
 * `WCM_Page.<id>=N` cambia en cada hoja, por eso NO se construye a mano: se
 * extrae del HTML. Verificado en vivo: la paginación es 1-indexada y en cada
 * página solo hay anclas "siguiente" (N=current+1) y "última" (N=total). Se busca
 * exactamente N=current+1 (sin fallback a N=current, que causaría un bucle en la
 * última página).
 */
export function nextPageUrl(html: string, current: number): string | null {
  const $ = load(html);
  let next: string | null = null;
  $('a[href*="WCM_Page"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = /WCM_Page\.[0-9a-fA-F]+=(\d+)/.exec(href);
    if (m && parseInt(m[1], 10) === current + 1) next = href;
  });
  return next;
}

/** Todos los enlaces (href + texto visible) de una página, para el crawler. */
export function extractLinks(html: string): Array<{ href: string; text: string }> {
  const $ = load(html);
  const out: Array<{ href: string; text: string }> = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (href) out.push({ href, text });
  });
  return out;
}
