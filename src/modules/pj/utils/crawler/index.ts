import { MAX_LEAF_PAGES, MAX_TREE_DEPTH } from "../../constants";
import { fetchHtml } from "../../services/pj";
import {
  extractLinks,
  nextPageUrl,
  parseLeafDocs,
  parsePageInfo,
} from "../parse";
import type { Ctx, Leaf, PjDoc, TreeNode } from "../../types";

/** Normaliza un href a path absoluto del PJ, sin query/fragment y con "/" final. */
function normalizePath(href: string): string | null {
  let p = href.split("?")[0].split("#")[0].trim();
  if (p.startsWith("http")) {
    try {
      const u = new URL(p);
      if (!u.hostname.endsWith("pj.gob.pe")) return null;
      p = u.pathname;
    } catch {
      return null;
    }
  }
  if (!p.startsWith("/")) return null;
  if (!p.endsWith("/")) p += "/";
  return p;
}

function segments(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function humanizeSegment(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? "";
  return last
    .replace(/^as_/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_]+/g, " ")
    .trim();
}

/**
 * Hijos directos de un nodo índice: enlaces exactamente un segmento más
 * profundos y bajo su ruta. Es el truco clave del portal: el menú lateral repite
 * el árbol ENTERO en cada página, así que filtrar por profundidad +1 evita
 * tratar todo el árbol como hijos de cada nodo.
 */
function directChildren(node: TreeNode, html: string): TreeNode[] {
  const base = normalizePath(node.url);
  if (!base) return [];
  const baseDepth = segments(base);
  const seen = new Set<string>();
  const out: TreeNode[] = [];

  for (const { href, text } of extractLinks(html)) {
    const p = normalizePath(href);
    if (!p || p === base || !p.startsWith(base)) continue;
    if (segments(p) !== baseDepth + 1) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({
      url: p,
      breadcrumb: [...node.breadcrumb, text || humanizeSegment(p)],
    });
  }
  return out;
}

/** Recolecta todas las páginas de una hoja siguiendo el enlace "siguiente". */
async function collectLeafPages(
  ctx: Ctx,
  firstHtml: string,
  firstDocs: PjDoc[],
): Promise<PjDoc[]> {
  const all = new Map<string, PjDoc>();
  for (const d of firstDocs) all.set(d.pdfUrl, d);

  const info = parsePageInfo(firstHtml);
  if (info.total <= 1) return [...all.values()]; // hoja de una sola página

  // Guarda contra bucles: no re-visitar una URL de página ya vista, y tope duro.
  const seen = new Set<string>();
  const cap = Math.min(info.total + 2, MAX_LEAF_PAGES);
  let html = firstHtml;
  let current = info.current;

  for (let i = 0; i < cap; i++) {
    const next = nextPageUrl(html, current);
    if (!next || seen.has(next)) break;
    seen.add(next);
    try {
      html = await fetchHtml(ctx, next);
    } catch (e) {
      ctx.log.warn(
        "Paginación %s falló: %s",
        next,
        e instanceof Error ? e.message : String(e),
      );
      break;
    }
    for (const d of parseLeafDocs(html)) all.set(d.pdfUrl, d);
    const pi = parsePageInfo(html);
    current = pi.current > current ? pi.current : current + 1;
  }

  return [...all.values()];
}

/**
 * BFS del árbol de jurisprudencia. Clasifica cada página como índice (solo
 * subcategorías) u hoja (tabla de sentencias) según su contenido, no su
 * profundidad — el árbol NO es de profundidad fija (Acuerdos Plenarios mete un
 * nivel por año). Llama `onLeaf` por cada hoja encontrada (streaming, para
 * ingestar sin acumular todo en memoria). El árbol se re-crawlea barato en cada
 * corrida; la reanudación real la da el ledger (dedupe por documento).
 */
export async function crawlLeaves(
  ctx: Ctx,
  onLeaf: (leaf: Leaf) => Promise<void>,
  shouldContinue: () => boolean = () => true,
): Promise<void> {
  const { cfg, log, stats } = ctx;
  const visited = new Set<string>();
  const queue: TreeNode[] = [{ url: cfg.rootPath, breadcrumb: [] }];

  while (queue.length) {
    if (!shouldContinue()) break;
    const node = queue.shift();
    if (!node) break;
    const norm = normalizePath(node.url);
    if (!norm || visited.has(norm)) continue;
    visited.add(norm);
    if (node.breadcrumb.length > MAX_TREE_DEPTH) continue;

    let html: string;
    try {
      html = await fetchHtml(ctx, node.url);
    } catch (e) {
      log.warn(
        "Nodo %s no accesible: %s",
        node.url,
        e instanceof Error ? e.message : String(e),
      );
      continue;
    }

    // Un nodo puede ser hoja (tiene sentencias) y/o índice (tiene subcategorías).
    // Se procesan las dos cosas: no son excluyentes (hay nodos híbridos).
    const docs = parseLeafDocs(html);
    if (docs.length > 0) {
      const allDocs = await collectLeafPages(ctx, html, docs);
      stats.hojas += 1;
      log.info(
        "Hoja [%s] -> %d documentos",
        node.breadcrumb.join(" / ") || "(raíz)",
        allDocs.length,
      );
      await onLeaf({
        url: node.url,
        breadcrumb: node.breadcrumb,
        tema: node.breadcrumb[node.breadcrumb.length - 1] ?? null,
        baseLegal: null,
        docs: allDocs,
      });
    }

    for (const child of directChildren(node, html)) {
      if (!visited.has(normalizePath(child.url) ?? "")) queue.push(child);
    }
  }
}
