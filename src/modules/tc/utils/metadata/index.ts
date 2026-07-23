import type { Area, Config, Doc, Metadata } from "../../types";

/** Título legible: "<tipo> <expediente> (<n.º sentencia>)". */
function buildTitle(doc: Doc): string {
  const tipo = doc.tipo || "Sentencia";
  const exp = doc.expediente ? `Expediente ${doc.expediente}` : "";
  const sent = doc.sentencia ? ` (${doc.sentencia})` : "";
  const base = [tipo, exp].filter(Boolean).join(" ") + sent;
  return base.trim() || doc.slug || doc.id || "Sentencia del Tribunal Constitucional";
}

export function buildMetadata(
  doc: Doc,
  issuerEntityId: string | null,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const published = doc.publishedAt || null;
  const meta: Metadata = {
    country: cfg.ingestCountry,
    type: "jurisprudence",
    title: buildTitle(doc),
    document_number: doc.expediente || null,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: doc.pdfUrl || "",
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: published,
    effective_date: doc.sentenceDate || published,
    keywords: [doc.sala, doc.distrito, doc.tipo, doc.sentido].filter(
      (k): k is string => Boolean(k)
    ),
    concepts,
    references,
  };
  if (issuerEntityId) {
    meta.issuer_entity_ids = [issuerEntityId];
  }
  return meta;
}

/** Texto para clasificar el área legal: fundamentos curados > contenido del PDF > título. */
export function textoParaClasificar(doc: Doc): string {
  const fund = doc.fundamentos.join(" ").trim();
  if (fund.length >= 80) return fund.slice(0, 3000);
  if (doc.content && doc.content.trim().length >= 80) {
    return doc.content.slice(0, 3000);
  }
  const partes = [doc.tipo, doc.expediente, doc.demandante, doc.demandado, fund];
  return partes.filter(Boolean).join(" ").slice(0, 3000);
}
