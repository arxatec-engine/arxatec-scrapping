import { closeOcr } from "../../services/ocr";
import type { Logger } from "../../types";

import { config as adlpConfig } from "../adlp/config";
import { run as adlpRun } from "../adlp/run";
import { config as spleyConfig } from "../spley/config";
import { run as spleyRun } from "../spley/run";

/**
 * `adlp` y `spley` comparten `*.congreso.gob.pe`.
 *
 * A diferencia del carril de gob.pe, aquí **no se comparte navegador ni
 * throttle**: son dos hosts distintos dentro del mismo dominio
 * (`www.leyes.congreso.gob.pe` y `wb2server.congreso.gob.pe`) y cada módulo usa
 * el suyo. Lo que importa es que **no corran a la vez**, porque la
 * infraestructura del Congreso es intermitente y dos frentes simultáneos la
 * empeoran.
 *
 * Por eso este carril es, deliberadamente, poco más que «uno detrás de otro»:
 * la propiedad que aporta es la exclusión mutua, no compartir recursos.
 */
interface Subfuente {
  nombre: string;
  limitEnv: string;
  ejecutar: (log: Logger) => Promise<void>;
}

const SUBFUENTES: Subfuente[] = [
  {
    nombre: "adlp",
    limitEnv: "ADLP_LIMIT",
    ejecutar: (log) => adlpRun(adlpConfig(), log),
  },
  {
    nombre: "spley",
    limitEnv: "SPLEY_LIMIT",
    ejecutar: (log) => spleyRun(spleyConfig(), log),
  },
];

export const LIMIT_ENVS = SUBFUENTES.map((s) => s.limitEnv);

export interface Resultado {
  nombre: string;
  ok: boolean;
  error: string | null;
  segundos: number;
}

export async function run(log: Logger): Promise<Resultado[]> {
  log.info("Carril congreso: %d subfuentes, una tras otra", SUBFUENTES.length);

  const resultados: Resultado[] = [];

  try {
    for (const sub of SUBFUENTES) {
      const inicio = Date.now();
      log.info("── carril congreso → %s ──", sub.nombre);
      try {
        await sub.ejecutar(log);
        resultados.push({
          nombre: sub.nombre,
          ok: true,
          error: null,
          segundos: (Date.now() - inicio) / 1000,
        });
      } catch (e) {
        // Regla del owner: una fuente caída no detiene la tanda.
        const error = e instanceof Error ? e.message : String(e);
        log.warn("Subfuente %s falló: %s — se anota y se sigue.", sub.nombre, error);
        resultados.push({
          nombre: sub.nombre,
          ok: false,
          error,
          segundos: (Date.now() - inicio) / 1000,
        });
      }
    }
  } finally {
    await closeOcr();
  }

  const ok = resultados.filter((r) => r.ok).length;
  log.info("============================================================");
  log.info("RESUMEN DEL CARRIL congreso: %d/%d subfuentes OK", ok, resultados.length);
  for (const r of resultados) {
    log.info(
      "  %s",
      `${r.ok ? "✓" : "✗"} ${r.nombre.padEnd(11)} ${r.segundos.toFixed(0)}s` +
        (r.error ? ` — ${r.error}` : "")
    );
  }
  log.info("============================================================");

  return resultados;
}
