import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import { LEGAL_KEYWORDS } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/** ¿La tesis/artículo es jurídico? (materia, título o tipo con término legal). */
export function esJuridico(doc: Doc): boolean {
  const texto = [doc.titulo, ...doc.materias].join(" ").toLowerCase();
  return LEGAL_KEYWORDS.some((k) => texto.includes(k));
}

/** Tipo de documento académico legible ("Tesis", "Artículo"). */
function tipoLegible(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("thesis")) return "Tesis";
  if (t.includes("article")) return "Artículo";
  if (t.includes("book")) return "Libro";
  return "Documento académico";
}

function buildCitation(doc: Doc): string {
  const autor = doc.autores[0] ?? doc.emisor;
  const fecha = fechaCorta(doc.fecha);
  const anio = fecha ? fecha.split("-").pop() : null;
  return `${autor}${anio ? ` (${anio})` : ""}. ${doc.titulo}. ${doc.emisor}.`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = stripHtml(doc.titulo) || "Documento académico";

  const meta: Metadata = {
    country: cfg.ingestCountry,
    type: "doctrine",
    title,
    document_number: null,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: doc.url,
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.fecha,
    effective_date: doc.fecha,
    citation: buildCitation(doc),
    court_chamber: null,
    origin_district: null,
    keywords: [tipoLegible(doc.tipo), doc.emisor, ...doc.materias.slice(0, 6)].filter(Boolean),
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}

/** Cuerpo del documento académico (título + autores + materias + resumen). */
export function buildBodyHtml(doc: Doc): string {
  const esc = (s: string) =>
    stripHtml(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<h1>${esc(doc.titulo)}</h1>` +
    `<p><strong>${tipoLegible(doc.tipo)}</strong> — ${esc(doc.emisor)}</p>` +
    (doc.autores.length ? `<p><strong>Autor(es):</strong> ${esc(doc.autores.join("; "))}</p>` : "") +
    (doc.fecha ? `<p><strong>Fecha:</strong> ${esc(doc.fecha)}</p>` : "") +
    (doc.materias.length ? `<p><strong>Materias:</strong> ${esc(doc.materias.join("; "))}</p>` : "") +
    (doc.resumen ? `<h2>Resumen</h2><p>${esc(doc.resumen)}</p>` : "") +
    (doc.url ? `<p><strong>Fuente:</strong> ${esc(doc.url)}</p>` : "")
  );
}

export { tipoLegible };
