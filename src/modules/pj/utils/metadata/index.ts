import type {
  AreaResolved,
  Config,
  Issuer,
  Leaf,
  Metadata,
  PjDoc,
} from "../../types";

/** Normaliza el nº de recurso: "29056 - 2019" -> "29056-2019". */
export function cleanRecurso(recurso: string | null): string | null {
  if (!recurso) return null;
  const v = recurso.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  return v || null;
}

/**
 * id natural para dedupe en el ledger: la URL del PDF, que lleva el hash WCM y
 * es única por archivo. Es la clave más robusta contra re-listados del mismo
 * documento (la misma casación aparece bajo varios temas): dedup por archivo,
 * sin falsos positivos entre secciones ni riesgo de colisión de nº de recurso.
 * recurso/sala se guardan aparte en el ledger para lectura. Es la defensa
 * anti-duplicados del punto A1 (ver docs/deuda-tecnica.md).
 */
export function naturalId(doc: PjDoc): string {
  return doc.pdfUrl;
}

function buildTitle(doc: PjDoc, leaf: Leaf): string {
  const recurso = cleanRecurso(doc.recurso);
  const parts = [
    recurso ? `Recurso ${recurso}` : null,
    doc.sala,
    leaf.tema,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.join(" — ") || leaf.tema || "Resolución del Poder Judicial";
}

function absolutePdf(cfg: Config, pdfUrl: string): string {
  return pdfUrl.startsWith("http") ? pdfUrl : cfg.baseUrl + pdfUrl;
}

/**
 * Arma el JSON del contrato de ingesta para un documento del PJ. type siempre
 * "jurisprudence"; emisor constante (Poder Judicial como issuer, Corte Suprema
 * como court); área derivada del árbol (no IA). status="Vigente" es provisional
 * (ver docs/deuda-tecnica.md A2) — para jurisprudencia es una constante sin
 * semántica de vigencia.
 */
export function buildMetadata(
  doc: PjDoc,
  leaf: Leaf,
  area: AreaResolved,
  issuer: Issuer,
  cfg: Config,
): Metadata {
  const keywords = [leaf.tema, doc.sala, doc.distrito].filter(
    (k): k is string => Boolean(k && k.trim()),
  );

  return {
    country: cfg.ingestCountry,
    type: "jurisprudence",
    title: buildTitle(doc, leaf),
    document_number: cleanRecurso(doc.recurso),
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: absolutePdf(cfg, doc.pdfUrl),
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.fecha,
    effective_date: doc.fecha,
    keywords,
    concepts: [],
    references: [],
    issuer_entity_ids: issuer.issuerId ? [issuer.issuerId] : [],
    court_entity_ids: issuer.courtId ? [issuer.courtId] : [],
  };
}
