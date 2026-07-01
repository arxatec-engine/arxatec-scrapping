import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";

import { stripHtml } from "../text";

export function buildHtml(
  title: string | null,
  metaParts: Array<string | null | undefined>,
  bodyHtml: string,
): string {
  const titulo = stripHtml(title) || "Documento";

  const meta = metaParts.filter((p) => p).join(" &middot; ");
  return (
    "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
    "<style>body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;}" +
    ".doc-meta{color:#555;font-size:8pt;border-bottom:1px solid #ccc;" +
    "padding-bottom:4px;margin-bottom:10px;}</style>" +
    `<title>${titulo}</title></head><body>` +
    `<div class='doc-meta'>${meta}</div>${bodyHtml}</body></html>`
  );
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({ headless: true });
}

export async function renderPdf(browser: Browser, html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await page.close();
  }
}
