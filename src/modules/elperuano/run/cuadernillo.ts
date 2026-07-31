import { basename } from "node:path";

import { ingestRequest, type IngestCtx } from "../services/assistant";
import {
  downloadCuadernilloPdf,
  resolveCuadernillo,
} from "../services/cuadernillo";
import { cuadernilloUrl } from "../constants";
import { fechaCorta } from "../../../utils/dates";
import { newThrottle } from "../../../utils";
import * as store from "../../../utils/store";
import { nowTs } from "../../../utils/time";
import type { Config, Logger, Metadata, StoredRecord } from "../types";

/** YYYYMMDD del día `offset` atrás (0 = hoy), hora local. */
function yyyymmdd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function fechaIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Modo cuadernillo: ingesta el boletín oficial diario (un PDF por día) para
 * los últimos `cuadernilloDias`. El id del ledger es `cuadernillo-YYYYMMDD`
 * (no colisiona con los OP del índice CSV), así que re-ejecutar salta los días
 * ya hechos: esto ES el job de actualización diaria.
 */
export async function runCuadernillo(cfg: Config, log: Logger): Promise<void> {
  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords<StoredRecord>(cfg.docsPath)) {
    if (rec.ingest?.done) processed.add(id);
  }

  const ctx: IngestCtx = {
    cfg,
    log,
    ingestThrottle: newThrottle(cfg.minDelay),
  };

  let ok = 0;
  let sinEdicion = 0;
  let errores = 0;
  for (let i = 1; i <= cfg.cuadernilloDias; i++) {
    const fecha = yyyymmdd(i);
    const id = `cuadernillo-${fecha}`;
    if (processed.has(id)) continue;

    const dia = await resolveCuadernillo(cfg, log, fecha);
    if (!dia) {
      sinEdicion += 1;
      continue;
    }
    try {
      const pdf = await downloadCuadernilloPdf(cfg, dia);
      const iso = fechaIso(fecha);
      const titulo = `Cuadernillo de Normas Legales — ${fechaCorta(iso) ?? iso}`;
      const meta: Metadata = {
        country: cfg.ingestCountry,
        type: "normative",
        title: titulo,
        document_number: `NL-${fecha}`,
        jurisdiction: cfg.ingestCountry,
        // El boletín agrupa normas de TODAS las materias del día; se marca con
        // el área/subárea generales (el backend exige subarea no vacía).
        legal_area: "Derecho administrativo",
        subarea: "General",
        legal_area_id: null,
        legal_subarea_id: null,
        source: cfg.ingestSource,
        source_url: cuadernilloUrl(fecha),
        status: cfg.ingestStatus,
        version: 1,
        language: "es",
        published_at: iso,
        effective_date: iso,
        citation: `${titulo}, Diario Oficial El Peruano`,
        court_chamber: null,
        origin_district: null,
        keywords: ["Cuadernillo de Normas Legales", "Diario Oficial El Peruano"],
        concepts: [],
        references: [],
      };
      const result = await ingestRequest(ctx, pdf, `${id}.pdf`, meta);
      const rec: StoredRecord = {
        id,
        fechaPublicacion: iso,
        entidad: "Diario Oficial El Peruano",
        dispositivo: "Cuadernillo",
        numero: `NL-${fecha}`,
        sumilla: titulo,
        clasificacion: {
          group_id: null, group_name: null, subgroup_id: null, subgroup_name: null,
          entity_id: null, entity_name: null, match_confidence: "unmatched",
        },
        legal_area: null,
        ingest: {
          done: result.ok || result.permanent,
          ok: result.ok,
          permanent: result.permanent,
          status: result.status,
          document_id: result.data.document_id ?? null,
          indexed_chunks: result.data.indexed_chunks ?? null,
          pages_with_text: result.data.pages_with_text ?? null,
          linked_entities: result.data.linked_entities ?? null,
          linked_relations: result.data.linked_relations ?? null,
          error: result.error,
          warning: null,
          ts: nowTs(),
        },
      };
      store.appendRecord(cfg.docsPath, rec);
      if (result.ok) {
        ok += 1;
        log.info(
          "Cuadernillo %s -> doc=%s chunks=%s paginas=%s",
          fecha,
          result.data.document_id,
          result.data.indexed_chunks,
          result.data.pages_with_text
        );
      } else {
        errores += 1;
        log.warn("Cuadernillo %s rechazado (status=%s): %s", fecha, result.status, result.error);
      }
    } catch (e) {
      errores += 1;
      log.warn("Cuadernillo %s: fallo (%s)", fecha, e instanceof Error ? e.message : e);
    }
  }

  const total = store.latestRecords<StoredRecord>(cfg.docsPath).size;
  log.info("=".repeat(60));
  log.info("RESUMEN CUADERNILLO (últimos %d días)", cfg.cuadernilloDias);
  log.info("  Boletines ingestados esta corrida: %d", ok);
  log.info("  Días sin edición (saltados): %d", sinEdicion);
  log.info("  Errores: %d", errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), total);
  log.info("=".repeat(60));
}
