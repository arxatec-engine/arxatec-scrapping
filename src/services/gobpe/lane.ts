import type { Browser } from "puppeteer";

import { launchBrowser, newThrottle } from "../../utils";
import type { Throttle } from "../../types";

/**
 * Recursos compartidos por las 13 subfuentes que viven en `www.gob.pe`.
 *
 * El problema que resuelve: el throttle de `utils/http` es un objeto en
 * memoria, así que **no se comparte entre procesos**. Con las 13 corriendo por
 * separado había 13 ritmos corteses independientes contra un único portal del
 * Estado — que es la forma más rápida de que nos bloqueen la IP.
 *
 * Al ejecutarlas dentro de UN proceso con este carril, el throttle vuelve a
 * significar lo que dice: un ritmo total. Y de paso se comparte el navegador,
 * que es lo caro en RAM (~800 MB cada uno).
 */
export interface GobpeLane {
  browser: Browser;
  /** Ritmo compartido contra `www.gob.pe/busquedas.json`. */
  throttle: Throttle;
}

export async function openLane(minDelay: number): Promise<GobpeLane> {
  return { browser: await launchBrowser(), throttle: newThrottle(minDelay) };
}

export async function closeLane(lane: GobpeLane): Promise<void> {
  await lane.browser.close();
}
