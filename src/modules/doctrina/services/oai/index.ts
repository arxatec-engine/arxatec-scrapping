import { throttleWait } from "../../../../utils/http";
import { sleep } from "../../../../utils/time";
import { toIsoDate } from "../../../../utils/time";
import type { RepoOai } from "../../constants";
import type { Ctx, Doc } from "../../types";

/**
 * Cliente OAI-PMH mínimo (verbo ListRecords, prefijo oai_dc). Sin dependencias
 * de XML: el formato Dublin Core es plano (`<dc:tag>valor</dc:tag>`) y el
 * parser por regex basta. Paginación por `resumptionToken` (el estándar).
 */

function fetchOai(ctx: Ctx, url: string, userAgent: string): Promise<string> {
  const { cfg, log } = ctx;
  return (async () => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
      await throttleWait(ctx.oaiThrottle, "oai");
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": userAgent, Accept: "application/xml,text/xml" },
          redirect: "follow",
          signal: AbortSignal.timeout(cfg.requestTimeout * 1000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
        const body = await res.text();
        if (!body.includes("<OAI-PMH")) throw new Error("respuesta no es OAI-PMH");
        return body;
      } catch (e) {
        lastErr = e;
        if (attempt === cfg.maxRetries) break;
        const backoff = Math.min(cfg.backoffBase ** attempt, 30);
        log.warn(
          "OAI %s falló (intento %d/%d), reintento en %ss: %s",
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
  })();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    // SciELO envuelve los valores en CDATA; el resto los manda planos.
    const plano = m[1]
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "");
    const v = decodeEntities(plano.trim());
    if (v) out.push(v);
  }
  return out;
}

/** Handle URL preferida (hdl.handle.net) de entre los dc:identifier. */
function pickUrl(ids: string[]): string {
  return (
    ids.find((i) => /hdl\.handle\.net|handle\//.test(i)) ??
    ids.find((i) => /^https?:\/\//.test(i)) ??
    ids[0] ??
    ""
  );
}

export interface HarvestPage {
  docs: Doc[];
  resumptionToken: string | null;
}

/**
 * Una página de ListRecords → Doc[]. `token` continúa la cosecha; en OAI el
 * token ES el único parámetro que se manda en las páginas siguientes.
 */
export async function harvestPage(
  ctx: Ctx,
  repo: RepoOai,
  token: string | null
): Promise<HarvestPage> {
  const q = token
    ? `verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
    : `verb=ListRecords&metadataPrefix=oai_dc${repo.set ? `&set=${encodeURIComponent(repo.set)}` : ""}`;
  const xml = await fetchOai(ctx, `${repo.baseUrl}?${q}`, repo.userAgent ?? ctx.cfg.userAgent);

  const docs: Doc[] = [];
  // `<record>` puede traer atributos (SciELO le cuelga el xmlns de DC).
  for (const m of xml.matchAll(/<record(?:\s[^>]*)?>([\s\S]*?)<\/record>/g)) {
    const rec = m[1];
    // Registros borrados (status="deleted") no traen metadata: se saltan.
    if (/<header[^>]*status="deleted"/.test(rec)) continue;
    const headerId = /<identifier>([^<]+)<\/identifier>/.exec(rec)?.[1]?.trim();
    if (!headerId) continue;
    const meta = /<metadata>([\s\S]*?)<\/metadata>/.exec(rec)?.[1] ?? "";
    const ids = tagValues(meta, "identifier");
    docs.push({
      oaiId: headerId,
      repoKey: repo.key,
      emisor: repo.emisor,
      titulo: tagValues(meta, "title")[0] ?? "",
      autores: tagValues(meta, "creator"),
      fecha: toIsoDate(tagValues(meta, "date")[0]),
      tipo: tagValues(meta, "type")[0] ?? "",
      materias: tagValues(meta, "subject"),
      resumen: tagValues(meta, "description")[0] ?? "",
      url: pickUrl(ids),
    });
  }

  const tokMatch = /<resumptionToken[^>]*>([^<]*)<\/resumptionToken>/.exec(xml);
  const next = tokMatch && tokMatch[1].trim() ? tokMatch[1].trim() : null;
  return { docs, resumptionToken: next };
}
