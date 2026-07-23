import axios from "axios";
import { newThrottle, request } from "../../../../utils";
import { toIsoDate } from "../../../../utils/time";
import { PAGE_SIZE } from "../../constants";
import type { Api, Config, Doc, Logger, Page, RawResult } from "../../types";

export function newApi(cfg: Config, log: Logger): Api {
  return { cfg, log, throttle: newThrottle(cfg.minDelay) };
}

function cronologicoUrl(cfg: Config, month: string, page: number): string {
  const qs = new URLSearchParams({
    fecha_publicacion: month,
    page: String(page),
  });
  return `${cfg.urlCronologico}?${qs.toString()}`;
}

/** Una página (10 ítems) del recorrido cronológico para un mes `YYYY-MM`. */
export async function buscarMes(
  api: Api,
  month: string,
  page: number
): Promise<Page> {
  const cfg = api.cfg;
  const data: any = await request({
    method: "GET",
    url: cronologicoUrl(cfg, month, page),
    throttle: api.throttle,
    throttleKey: "buscar",
    log: api.log,
    maxRetries: cfg.maxRetries,
    backoffBase: cfg.backoffBase,
    timeout: cfg.requestTimeout,
    headers: cfg.headers,
    expect: "json",
  });
  const total = parseInt(String(data?.total ?? "0"), 10) || 0;
  const numPages = Number(data?.pagination?.num_pages ?? 0) || 0;
  const docs: RawResult[] = data?.data || [];
  return { docs, total, numPages };
}

/** total_agregados = tamaño del corpus completo (todas las fechas). */
export async function totalCorpus(api: Api): Promise<number> {
  const cfg = api.cfg;
  const data: any = await request({
    method: "GET",
    url: cfg.urlCronologico,
    throttle: api.throttle,
    throttleKey: "buscar",
    log: api.log,
    maxRetries: cfg.maxRetries,
    backoffBase: cfg.backoffBase,
    timeout: cfg.requestTimeout,
    headers: cfg.headers,
    expect: "json",
  });
  return Number(data?.total_agregados ?? 0) || 0;
}

export async function descargarPdf(api: Api, url: string): Promise<Uint8Array> {
  const cfg = api.cfg;
  const r = await axios.request({
    method: "GET",
    url,
    headers: cfg.headers,
    timeout: cfg.requestTimeout * 1000,
    responseType: "arraybuffer",
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true,
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`HTTP ${r.status} al descargar ${url}`);
  }
  return new Uint8Array(r.data as ArrayBuffer);
}

function nombre(node: unknown): string | null {
  if (node && typeof node === "object") {
    const n = (node as Record<string, unknown>).nombre;
    if (n) return String(n);
  }
  return null;
}

export function parse(raw: RawResult): Doc {
  const s = (raw?._source ?? raw) as Record<string, any>;
  const fundamentos = Array.isArray(s.fundamentos)
    ? s.fundamentos.map((f: unknown) => String(f)).filter(Boolean)
    : [];
  const content =
    s.attachment && typeof s.attachment === "object"
      ? (s.attachment.content ? String(s.attachment.content) : null)
      : null;
  return {
    id: s.id != null ? String(s.id) : raw?._id != null ? String(raw._id) : null,
    expediente: s.numero_expediente ?? null,
    sentencia: s.numero_sentencia ?? null,
    slug: s.slug ?? null,
    pdfUrl: s.url_archivo ?? null,
    publishedAt: toIsoDate(s.fecha_publicacion),
    sentenceDate: toIsoDate(s.fecha_sentencia),
    demandante: s.nombre_demandante ?? null,
    demandado: s.nombre_demandado ?? null,
    sala: nombre(s.sentencia_sala),
    distrito: nombre(s.sentencia_distrito),
    tipo: nombre(s.sentencia_tipo) ?? (s.tipo ?? null),
    sentido: nombre(s.sentencia_sentido),
    fundamentos,
    content,
  };
}
