import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { stripHtml } from "../../../../utils/text";
import { BASE_URL, LISTA_URL, PDF_PATH } from "../../constants";
import type { Ctx, Doc } from "../../types";

/**
 * Cliente del buscador WebForms del ADLP. El HTTPS del sitio es intermitente
 * (responde en 0.2 s o cuelga el handshake) → timeout corto y reintentos
 * pacientes. El POST necesita los campos ocultos (__VIEWSTATE y compañía) de
 * un GET previo; el mismo ViewState sirve para todos los POST de la corrida
 * (verificado), y si el sitio lo invalida se refresca una vez y se reintenta.
 */

async function fetchRaw(
  ctx: Ctx,
  url: string,
  body: string | null
): Promise<Uint8Array> {
  const { cfg, log } = ctx;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.adlpThrottle, "adlp");
    try {
      const res = await fetch(url, {
        method: body === null ? "GET" : "POST",
        headers: {
          "User-Agent": cfg.userAgent,
          "Accept-Language": "es-PE,es;q=0.9",
          ...(body === null
            ? {}
            : { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
      });
      if (res.status === 404) throw new Error(`HTTP 404 en ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      const permanent = e instanceof Error && /HTTP 404/.test(e.message);
      if (permanent || attempt === cfg.maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 20);
      log.warn(
        "%s %s falló (intento %d/%d), reintento en %ss: %s",
        body === null ? "GET" : "POST",
        url,
        attempt,
        cfg.maxRetries,
        backoff.toFixed(1),
        e instanceof Error ? e.message : e
      );
      await sleep(backoff);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchHtml(ctx: Ctx, url: string, body: string | null): Promise<string> {
  const bytes = await fetchRaw(ctx, url, body);
  return new TextDecoder("utf-8").decode(bytes);
}

export function fetchPdf(ctx: Ctx, url: string): Promise<Uint8Array> {
  return fetchRaw(ctx, url, null);
}

export function pdfUrl(numero: number): string {
  return `${BASE_URL}${PDF_PATH}/${numero}.pdf`;
}

const HIDDEN = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"] as const;

async function formState(ctx: Ctx): Promise<Record<string, string>> {
  if (ctx.form) return ctx.form;
  const html = await fetchHtml(ctx, LISTA_URL, null);
  const form: Record<string, string> = {};
  for (const name of HIDDEN) {
    const m = new RegExp(`id="${name}" value="([^"]*)"`).exec(html);
    if (!m) throw new Error(`el buscador no trajo el campo oculto ${name}`);
    form[name] = m[1];
  }
  ctx.form = form;
  return form;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

interface FilaIdx {
  tipo: string;
  numero: number;
  fecha: string | null;
  titulo: string;
}

/** "09/12/1997" → "1997-12-09". */
function fechaIso(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Filas del grid de resultados (las que enlazan el detalle por número). */
function parseFilas(html: string): FilaIdx[] {
  const filas: FilaIdx[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const fila = m[1];
    if (!fila.includes("_LinkNumero")) continue;
    const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeEntities(stripHtml(c[1]).replace(/\s+/g, " ").trim())
    );
    // [tipo, número, fecha, título, observaciones]
    if (celdas.length < 4) continue;
    const numero = Number(celdas[1]);
    if (!Number.isFinite(numero) || numero <= 0) continue;
    filas.push({
      tipo: celdas[0],
      numero,
      fecha: fechaIso(celdas[2]),
      titulo: celdas[3],
    });
  }
  return filas;
}

function buildBody(
  form: Record<string, string>,
  ini: number,
  fin: number,
  estado: "1" | "2"
): string {
  const p = new URLSearchParams({
    ...form,
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    "ctl00$ContentPlaceHolder1$TxtFechaIni": "",
    "ctl00$ContentPlaceHolder1$TxtFechaFin": "",
    "ctl00$ContentPlaceHolder1$TxtNroNormaI": String(ini),
    "ctl00$ContentPlaceHolder1$TxtNroNormaF": String(fin),
    "ctl00$ContentPlaceHolder1$TxtBuscar": "",
    "ctl00$ContentPlaceHolder1$DdlEstado": estado, // 1 = no vigentes · 2 = ambos
    "ctl00$ContentPlaceHolder1$DdlTipoNorma": "0", // LEY/RES.LEG./DECRETO LEY
    "ctl00$ContentPlaceHolder1$DdlTipoBusqueda": "4", // por número
    "ctl00$ContentPlaceHolder1$DdlOrdenar": "0",
    "ctl00$ContentPlaceHolder1$BtnConsultar": "Consultar",
  });
  return p.toString();
}

async function postVentana(
  ctx: Ctx,
  ini: number,
  fin: number,
  estado: "1" | "2"
): Promise<FilaIdx[]> {
  let form = await formState(ctx);
  let html = await fetchHtml(ctx, LISTA_URL, buildBody(form, ini, fin, estado));
  // Si el ViewState caducó, el postback devuelve la página sin grid ni error
  // claro: se refresca el estado UNA vez y se reintenta.
  if (!html.includes("GwDetalle") && !html.includes("_LinkNumero")) {
    ctx.form = null;
    form = await formState(ctx);
    html = await fetchHtml(ctx, LISTA_URL, buildBody(form, ini, fin, estado));
  }
  return parseFilas(html);
}

/**
 * Una ventana [ini, fin] (≤ VENTANA números, el grid trunca a 20 filas sin
 * paginador) → Docs con vigencia: dos consultas, "ambos" trae las filas y
 * "no vigentes" marca las derogadas.
 */
export async function fetchVentana(ctx: Ctx, ini: number, fin: number): Promise<Doc[]> {
  const filas = await postVentana(ctx, ini, fin, "2");
  if (filas.length === 0) return [];
  const noVigentes = await postVentana(ctx, ini, fin, "1");
  const derogadas = new Set(noVigentes.map((f) => f.numero));
  return filas.map((f) => ({
    id: `ley-${f.numero}`,
    tipo: f.tipo,
    numero: f.numero,
    titulo: f.titulo,
    fecha: f.fecha,
    derogada: derogadas.has(f.numero),
    href: pdfUrl(f.numero),
  }));
}
