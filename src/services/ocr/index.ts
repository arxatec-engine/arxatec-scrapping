import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createWorker, type Worker } from "tesseract.js";

import type { Logger } from "../../types";

const execFileAsync = promisify(execFile);

/**
 * OCR local COMPARTIDO para PDFs escaneados (el riesgo transversal de los
 * tribunales administrativos P3, ver estrategia-fuentes.md §5): el backend
 * RECHAZA con 400 "No extractable text" los PDFs sin capa de texto, así que
 * los módulos usan esto como fallback — extraen el texto con OCR y reingresan
 * un PDF de texto renderizado localmente (el original queda enlazado por
 * `source_url`).
 *
 * Implementación sin binarios de OCR: `pdftoppm` (poppler, ya presente por
 * los flujos de PDF) rasteriza a PNG y tesseract.js (WASM) reconoce en
 * español. El traineddata `spa` se descarga una vez y se cachea en
 * `state/ocr/`.
 */

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("spa", 1, { cachePath: "state/ocr" });
  }
  return workerPromise;
}

/** Cierra el worker de tesseract (llamar al final de la corrida). */
export async function closeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    workerPromise = null;
    await worker.terminate();
  }
}

/**
 * Texto plano de un PDF escaneado, o null si el OCR no produce nada creíble
 * (menos de 200 caracteres). Nunca lanza: el caller decide qué hacer con null.
 */
export async function ocrPdf(pdfBytes: Uint8Array, log: Logger): Promise<string | null> {
  const dir = mkdtempSync(join(tmpdir(), "arxatec-ocr-"));
  try {
    const pdfPath = join(dir, "doc.pdf");
    writeFileSync(pdfPath, pdfBytes);
    // 300dpi: equilibrio entre precisión sobre escaneos legales y velocidad.
    await execFileAsync("pdftoppm", ["-r", "300", "-png", pdfPath, join(dir, "pg")], {
      timeout: 120_000,
    });
    const pages = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    if (pages.length === 0) return null;

    const worker = await getWorker();
    let out = "";
    for (const page of pages) {
      const { data } = await worker.recognize(join(dir, page));
      out += data.text + "\n\n";
    }
    const text = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text.length >= 200 ? text : null;
  } catch (e) {
    log.warn("OCR local falló: %s", e instanceof Error ? e.message : e);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
