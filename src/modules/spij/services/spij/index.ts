import axios from "axios";

import { newThrottle, request, toIsoDate } from "@/utils";

import type {
  Api,
  AuthBody,
  Config,
  Doc,
  Logger,
  RawResult,
  SectorRaw,
  StoredRecord,
} from "../../types";

export function authBody(cfg: Config, solr = false): AuthBody {
  const body: AuthBody = { usuario: cfg.usuario, clave: cfg.clave };
  if (!solr) {
    body.tipo = cfg.tipoAcceso;
  }
  return body;
}

export function buscarBody(
  cfg: Config,
  desde: number,
  hasta: number
): Record<string, unknown> {
  return {
    filtros: {
      buscarHistorico: cfg.buscarHistorico,
      busquedaSugerida: false,
      numeroDispositivoLegal: " ",
      dispositivoLegal: cfg.dispositivoLegal,
      tomo: { id: "", nombre: "" },
      materia: { id: "", nombre: "" },
      agrupacion: [],
      sector: [],
      subSector: { id: "", nombre: "" },
      orden: "1",
    },
    facetsSeleccionadas: {
      fechaPublicacionGap: { numero: 10, unidad: "YEAR" },
    },
    tipoNorma: cfg.tipoNorma,
    textoBusqueda: null,
    textoSumilla: null,
    fechaInicio: cfg.fechaInicio,
    fechaFin: cfg.fechaFin,
    desde,
    hasta,
  };
}

export function extractToken(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (obj.value) {
      return String(obj.value).trim();
    }
  }
  throw new Error(`No se pudo extraer token de: ${JSON.stringify(payload)}`);
}

export function newApi(cfg: Config, log: Logger): Api {
  return {
    cfg,
    log,
    throttle: newThrottle(cfg.minDelay),
    token: null,
    tokenSolr: null,
  };
}

export async function authenticate(api: Api): Promise<void> {
  api.token = await _auth(api, api.cfg.authBack, false);
  api.tokenSolr = await _auth(api, api.cfg.authSolr, true);
  api.log.info("Autenticado correctamente (token + tokenSolr).");
}

async function _auth(api: Api, url: string, solr: boolean): Promise<string> {
  const cfg = api.cfg;

  const r = await axios.request({
    method: "POST",
    url,
    headers: { ...cfg.headers, "Content-Type": "application/json" },
    data: authBody(cfg, solr),
    timeout: cfg.requestTimeout * 1000,
    responseType: "text",
    transformResponse: [(d) => d],
    validateStatus: () => true,
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`HTTP ${r.status} en ${url}`);
  }
  const ctype = String(r.headers?.["content-type"] ?? "");

  const text = typeof r.data === "string" ? r.data : String(r.data ?? "");
  const data: unknown = ctype.includes("json") ? JSON.parse(text) : text;
  try {
    return extractToken(data);
  } catch {

    return extractToken(text);
  }
}

export async function buscar(
  api: Api,
  desde: number,
  hasta: number
): Promise<any> {
  const cfg = api.cfg;
  return (await request({
    method: "POST",
    url: cfg.urlBuscar,
    throttle: api.throttle,
    throttleKey: "buscar",
    log: api.log,
    maxRetries: cfg.maxRetries,
    backoffBase: cfg.backoffBase,
    timeout: cfg.requestTimeout,
    headers: cfg.headers,
    auth: () => (api.tokenSolr ? `Bearer ${api.tokenSolr}` : null),
    on401: () => authenticate(api),
    expect: "json",
    json: buscarBody(cfg, desde, hasta),
  })) as any;
}

export async function descargarWord(api: Api, docId: string): Promise<string> {
  const cfg = api.cfg;
  return (await request({
    method: "GET",
    url: `${cfg.urlWord}/${docId}`,
    throttle: api.throttle,
    throttleKey: "word",
    log: api.log,
    maxRetries: cfg.maxRetries,
    backoffBase: cfg.backoffBase,
    timeout: cfg.requestTimeout,
    headers: cfg.headers,
    auth: () => (api.token ? `Bearer ${api.token}` : null),
    on401: () => authenticate(api),
    expect: "text",
  })) as string;
}

export async function fetchSectores(api: Api): Promise<SectorRaw[]> {
  const cfg = api.cfg;
  try {
    const data = await request({
      method: "GET",
      url: cfg.urlSector,
      throttle: api.throttle,
      throttleKey: "sector",
      log: api.log,
      maxRetries: cfg.maxRetries,
      backoffBase: cfg.backoffBase,
      timeout: cfg.requestTimeout,
      headers: cfg.headers,
      auth: () => (api.token ? `Bearer ${api.token}` : null),
      on401: () => authenticate(api),
      expect: "json",
    });

    return flattenSectores(data);
  } catch (e) {
    api.log.warn("No se pudo traer /api/sector (sigo sin cadena padre): %s", e);
    return [];
  }
}

/**
 * /api/sector no devuelve un array plano de sectores, sino anidados bajo una
 * clave `sectores` (hoy responde `[{ sectores: [...] }]`). Aplanamos las formas
 * conocidas (array plano, `{ data }`, `{ sectores }` y arrays de esos) para
 * recuperar la cadena padre-hijo que usa el clasificador como respaldo.
 */
function flattenSectores(data: unknown): SectorRaw[] {
  const out: SectorRaw[] = [];
  const visit = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const it of node) visit(it);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.sectores)) return visit(obj.sectores);
      if (Array.isArray(obj.data)) return visit(obj.data);
      if (obj.id !== undefined || obj.nombre !== undefined) {
        out.push(obj as SectorRaw);
      }
    }
  };
  visit(data);
  return out;
}

export function parse(raw: RawResult): Doc {
  return {
    id: raw.id ?? null,
    code: raw.codigoNorma ?? null,
    sector: raw.sector || "",
    title: raw.sumilla ?? null,
    // SPIJ envía ISO (YYYY-MM-DD); normalizamos por si acaso para no romper el
    // endpoint (Pydantic `date`). Si no se puede interpretar queda null y el
    // guard de "norma sin fecha" en ingestOne la salta en vez de mandar un 422.
    publishedAt: toIsoDate(raw.fechaPublicacion),
    grouping: raw.ruta ?? null,
    dispositivoLegal: raw.dispositivoLegal ?? null,
  };
}

export function docFromRecord(rec: StoredRecord): Doc {
  return {
    id: rec.id,
    code: rec.codigoNorma ?? null,
    sector: rec.sector ?? null,
    title: rec.sumilla ?? null,
    publishedAt: toIsoDate(rec.fechaPublicacion),
    grouping: rec.ruta_agrupacion ?? null,
    dispositivoLegal: rec.dispositivoLegal ?? null,
  };
}
