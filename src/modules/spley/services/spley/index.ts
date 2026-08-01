import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { toIsoDate } from "../../../../utils/time";
import { API_BASE, ORIGIN } from "../../constants";
import { encryptParam } from "./crypto";
import type { Ctx, Doc } from "../../types";

interface PeriodoRaw {
  perParId?: number;
  desPerPar?: string;
}
interface ProyectoRaw {
  perParId?: number;
  pleyNum?: number;
  proyectoLey?: string;
  titulo?: string;
  desEstado?: string;
  fecPresentacion?: string;
  desProponente?: string;
  autores?: string;
}

function headers(ctx: Ctx): Record<string, string> {
  return {
    "User-Agent": ctx.cfg.userAgent,
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: ORIGIN,
    Referer: `${ORIGIN}/spley-portal/`,
  };
}

async function request(ctx: Ctx, url: string, init: RequestInit): Promise<unknown> {
  const { cfg, log } = ctx;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    await throttleWait(ctx.spleyThrottle, "spley");
    try {
      const res = await fetch(url, {
        ...init,
        headers: headers(ctx),
        signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt === cfg.maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 20);
      log.warn(
        "%s falló (intento %d/%d), reintento en %ss: %s",
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

function data<T>(body: unknown): T {
  const b = body as { data?: T };
  return (b.data ?? body) as T;
}

/** Períodos parlamentarios (reciente-primero, como los sirve la API). */
export async function fetchPeriodos(ctx: Ctx): Promise<number[]> {
  const body = await request(ctx, `${API_BASE}/periodo-parlamentario`, { method: "GET" });
  const arr = data<PeriodoRaw[]>(body) ?? [];
  return arr.map((p) => p.perParId).filter((n): n is number => typeof n === "number");
}

/**
 * Una página de la lista de proyectos de un período. La lista da la metadata
 * base; la sumilla completa llega por el expediente (fusionada en run).
 */
export async function fetchListaPage(
  ctx: Ctx,
  perParId: number,
  rowStart: number,
  pageSize: number
): Promise<{ rows: Doc[]; total: number }> {
  const body = await request(ctx, `${API_BASE}/proyecto-ley/lista-con-filtro`, {
    method: "POST",
    body: JSON.stringify({ perParId, rowStart, pageSize }),
  });
  const d = data<{ proyectos?: ProyectoRaw[]; rowsTotal?: number }>(body);
  const rows: Doc[] = (d.proyectos ?? [])
    .filter((p) => p.pleyNum && p.proyectoLey)
    .map((p) => ({
      perParId: p.perParId ?? perParId,
      pleyNum: p.pleyNum!,
      proyectoLey: p.proyectoLey!,
      titulo: (p.titulo ?? "").trim(),
      sumilla: "",
      desEstado: (p.desEstado ?? "").trim(),
      fecPresentacion: toIsoDate(p.fecPresentacion),
      desProponente: (p.desProponente ?? "").trim(),
      autores: (p.autores ?? "").trim(),
    }));
  return { rows, total: d.rowsTotal ?? rows.length };
}

/** Detalle del expediente (params CIFRADOS) → sumilla y estado al día. */
export async function fetchExpediente(ctx: Ctx, doc: Doc): Promise<Doc> {
  const url = `${API_BASE}/expediente/${encryptParam(doc.perParId)}/${encryptParam(doc.pleyNum)}`;
  try {
    const body = await request(ctx, url, { method: "GET" });
    const g = data<{ general?: Record<string, unknown> }>(body).general ?? {};
    return {
      ...doc,
      titulo: String(g.titulo ?? doc.titulo).trim(),
      sumilla: String(g.sumilla ?? "").trim(),
      desEstado: String(g.desEstado ?? doc.desEstado).trim(),
    };
  } catch (e) {
    ctx.log.warn("Expediente %s sin detalle (%s); se usa la metadata de lista.", doc.proyectoLey, e instanceof Error ? e.message : e);
    return doc;
  }
}
