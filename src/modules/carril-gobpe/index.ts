import { closeOcr } from "../../services/ocr";
import { closeLane, openLane } from "../../services/gobpe/lane";
import type { GobpeLane } from "../../services/gobpe/lane";
import type { Logger } from "../../types";

import { config as essaludConfig } from "../essalud/config";
import { run as essaludRun } from "../essalud/run";
import { config as indecopiConfig } from "../indecopi/config";
import { run as indecopiRun } from "../indecopi/run";
import { config as oefaConfig } from "../oefa/config";
import { run as oefaRun } from "../oefa/run";
import { config as osinergminConfig } from "../osinergmin/config";
import { run as osinergminRun } from "../osinergmin/run";
import { config as osiptelConfig } from "../osiptel/config";
import { run as osiptelRun } from "../osiptel/run";
import { config as ositranConfig } from "../ositran/config";
import { run as ositranRun } from "../ositran/run";
import { config as servirConfig } from "../servir/config";
import { run as servirRun } from "../servir/run";
import { config as sunarpConfig } from "../sunarp/config";
import { run as sunarpRun } from "../sunarp/run";
import { config as sunassConfig } from "../sunass/config";
import { run as sunassRun } from "../sunass/run";
import { config as tceConfig } from "../tce/config";
import { run as tceRun } from "../tce/run";
import { config as tfiscalConfig } from "../tfiscal/config";
import { run as tfiscalRun } from "../tfiscal/run";
import { config as tflConfig } from "../tfl/config";
import { run as tflRun } from "../tfl/run";
import { config as gobpeConfig } from "../gobpe/config";
import { run as gobpeRun } from "../gobpe/run";

/**
 * Las 13 subfuentes que comparten `www.gob.pe`, en un solo proceso.
 *
 * Orden: `gobpe` (normas por entidad) va **al final** por decisión previa del
 * owner — es la más pesada y la menos prioritaria.
 */
interface Subfuente {
  nombre: string;
  minDelay: () => number;
  ejecutar: (log: Logger, lane: GobpeLane) => Promise<void>;
}

/** Cada subfuente tiene su propio tipo `Config`; el closure los desacopla para
 *  que el carril no tenga que conocer trece formas distintas. */
function sub<C extends { minDelay: number }>(
  nombre: string,
  config: () => C,
  run: (cfg: C, log: Logger, lane?: GobpeLane) => Promise<void>
): Subfuente {
  return {
    nombre,
    minDelay: () => config().minDelay,
    ejecutar: (log, lane) => run(config(), log, lane),
  };
}

const SUBFUENTES: Subfuente[] = [
  sub("tfl", tflConfig, tflRun),
  sub("tfiscal", tfiscalConfig, tfiscalRun),
  sub("tce", tceConfig, tceRun),
  sub("indecopi", indecopiConfig, indecopiRun),
  sub("sunarp", sunarpConfig, sunarpRun),
  sub("servir", servirConfig, servirRun),
  sub("essalud", essaludConfig, essaludRun),
  sub("oefa", oefaConfig, oefaRun),
  sub("osinergmin", osinergminConfig, osinergminRun),
  sub("osiptel", osiptelConfig, osiptelRun),
  sub("sunass", sunassConfig, sunassRun),
  sub("ositran", ositranConfig, ositranRun),
  sub("gobpe", gobpeConfig, gobpeRun),
];

export const NOMBRES = SUBFUENTES.map((s) => s.nombre);

export interface Resultado {
  nombre: string;
  ok: boolean;
  error: string | null;
  segundos: number;
}

/**
 * Corre las 13 subfuentes de gob.pe **en secuencia y en un solo proceso**,
 * compartiendo navegador y ritmo.
 *
 * Por qué en secuencia: las 13 pegan al MISMO buscador
 * (`www.gob.pe/busquedas.json`). Lanzarlas a la vez no multiplica el
 * rendimiento —el límite lo pone el portal, no nosotros—, solo multiplica por
 * 13 la probabilidad de que nos bloqueen.
 *
 * Por qué en un proceso: el throttle de `utils/http` vive en memoria. Con 13
 * procesos había 13 ritmos independientes; con uno, el ritmo es de verdad uno.
 * Y se comparte el navegador, que son ~800 MB por instancia.
 *
 * Regla de fallo (decisión del owner): si una subfuente falla —sitio caído,
 * antibot—, **no se detiene la tanda**: se anota y se sigue con la siguiente.
 */
export async function run(log: Logger, soloEstas?: string[]): Promise<Resultado[]> {
  const seleccion = soloEstas?.length
    ? SUBFUENTES.filter((s) => soloEstas.includes(s.nombre))
    : SUBFUENTES;

  if (seleccion.length === 0) {
    log.warn("Ninguna subfuente coincide con %s", soloEstas?.join(", "));
    return [];
  }

  // El ritmo del carril lo marca la subfuente más cortés: se toma el mayor
  // `minDelay` de las seleccionadas para no ir más rápido que la más prudente.
  const minDelay = Math.max(...seleccion.map((s) => s.minDelay()));
  log.info(
    "Carril gob.pe: %d subfuentes en un proceso · ritmo compartido %ss",
    seleccion.length,
    minDelay.toFixed(2)
  );

  const lane = await openLane(minDelay);
  const resultados: Resultado[] = [];

  try {
    for (const sub of seleccion) {
      const inicio = Date.now();
      log.info("── carril gob.pe → %s ──", sub.nombre);
      try {
        await sub.ejecutar(log, lane);
        resultados.push({
          nombre: sub.nombre,
          ok: true,
          error: null,
          segundos: (Date.now() - inicio) / 1000,
        });
      } catch (e) {
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
    await closeLane(lane);
    await closeOcr();
  }

  const ok = resultados.filter((r) => r.ok).length;
  log.info("============================================================");
  log.info("RESUMEN DEL CARRIL gob.pe: %d/%d subfuentes OK", ok, resultados.length);
  for (const r of resultados) {
    // El logger usa util.format: no admite anchos tipo %-11s, así que el
    // alineado se hace aquí.
    log.info(
      "  %s",
      `${r.ok ? "✓" : "✗"} ${r.nombre.padEnd(11)} ${r.segundos.toFixed(0)}s` +
        (r.error ? ` — ${r.error}` : "")
    );
  }
  log.info("============================================================");

  return resultados;
}
