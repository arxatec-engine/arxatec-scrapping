import { extractText, getDocumentProxy } from "unpdf";

import type { Page } from "./types";

/**
 * Extrae el texto página a página del PDF.
 *
 * ⚠️ Diferencia conocida con el assistant: allí se usa `PyPDFLoader` (pypdf) y
 * aquí `unpdf` (pdf.js). Medido el 2026-08-07 sobre un PDF real de 10 páginas:
 * **99,6 % de similitud media** por página (mínimo 98,7 %), con diferencias de
 * espaciado y ligaduras. La igualdad byte a byte NO es alcanzable con
 * extractores distintos; el criterio de aceptación lo asume.
 *
 * El troceado posterior, en cambio, SÍ es idéntico: verificado 19/19 chunks
 * carácter a carácter con el mismo texto de entrada.
 */
export async function extractPages(pdfBytes: Uint8Array): Promise<Page[]> {
  // ⚠️ pdf.js DESPRENDE (detach) el ArrayBuffer que recibe. Si se le pasa el
  // original, cualquier uso posterior de esos bytes revienta con "Cannot
  // perform Construct on a detached ArrayBuffer" — y hay dos usos posteriores
  // reales: la subida a S3 y el fallback de OCR de los módulos. Se le da una
  // copia y el original queda intacto.
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const { text } = await extractText(pdf, { mergePages: false });

  const pages: Page[] = [];

  for (const [index, raw] of text.entries()) {
    const cleaned = cleanText(raw ?? "");
    if (!cleaned) continue;
    pages.push({ page: index + 1, text: cleaned });
  }

  return pages;
}

/**
 * Limpieza equivalente a `clean_extracted_text` del assistant: normaliza saltos
 * de línea y recorta. Se mantiene deliberadamente mínima — cuanto más se toque
 * el texto, más se separa de lo que indexó la otra ruta.
 */
function cleanText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
