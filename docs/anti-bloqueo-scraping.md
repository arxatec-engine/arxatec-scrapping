# Anti-bloqueo — cómo SPIJ no es bloqueado y qué puede ayudar a PJ

> Escrito 2026-07-22. Revisión pedida: entender cómo el scraper de SPIJ (el que
> ya existía) evita ser bloqueado, y qué de eso aplica al módulo PJ, que hoy sí
> se topó con el anti-bot del Poder Judicial.

## TL;DR

SPIJ **no usa trucos anti-bot exóticos**. No es bloqueado por tres razones, en
orden de peso: **(1) accede como API autenticada legítima** (usuario/clave →
tokens), **(2) el sitio de SPIJ no tiene un bot manager agresivo**, y (3) buena
higiene de cliente (headers de navegador, throttle, backoff, re-auth). PJ es un
escenario **más hostil**: portal público (sin auth) detrás de un **bot manager
Radware** que fingerprintea el cliente y throttlea por volumen. Por eso PJ
necesita cosas que SPIJ no: `fetch` en vez de axios (ya aplicado), headers de
navegación más completos (propuesto abajo), ritmo más suave, y —para el bloqueo
por IP— red residencial. **Ningún truco de código evita el throttle por IP**;
eso se maneja con ritmo + IP + reanudación.

## 1. Qué hace SPIJ (el trabajo del compañero) para no ser bloqueado

Revisado en `src/modules/spij/` y `src/utils/http/`:

| Técnica | Dónde | Qué logra |
| --- | --- | --- |
| **Acceso autenticado** | `services/spij/authenticate()` — login usuario/clave → 2 tokens Bearer (back + solr) | Es la razón principal: **no scrapea, consume la API como cliente legítimo**. Un cliente autenticado no dispara los mismos filtros anti-bot. |
| **Re-auth ante 401** | `utils/http/request` `on401` → `authenticate()` | Si el token expira, re-autentica y reintenta en vez de acumular 401 (que sí levantan sospecha). |
| **Headers de navegador** | `constants/http`: `User-Agent` Chrome real + `Origin` + `Referer` (apuntando a `spij.minjus.gob.pe`) + `Accept`/`Accept-Language` | La request se ve como la del propio web app de SPIJ, no como un bot pelado. |
| **Throttle serializado** | `utils/http/throttleWait` — cola por clave con `minDelay` entre requests | Espacia las llamadas (aunque el default `minDelay=0`); evita ráfagas. |
| **Concurrencia baja** | `config`: `concurrency=2` (semáforo) | No abre 50 conexiones a la vez. |
| **Backoff exponencial** | `utils/http/request` — 429/5xx → `backoffBase^intento` | Ante rechazo temporal, se retira y reintenta suave, no martillea. |
| **Ledger + checkpoint** | `utils/store` | Reanudable: si lo cortan, retoma sin re-pedir lo hecho (menos requests totales). |

**Lo importante:** SPIJ usa **axios normal** y le funciona. Eso confirma que el
sitio de SPIJ (`spijwsii.minjus.gob.pe`) **no fingerprintea el cliente HTTP**.
El mérito del compañero es la higiene (auth, headers, throttle, backoff,
reanudación) — sólida, pero pensada para un sitio que **coopera**.

## 2. Por qué PJ es más difícil

`pj.gob.pe` es otro mundo:

- **Sin auth**: scraping de un portal público → cae en la categoría "anónimo" que
  los bot managers vigilan más.
- **Bot manager Radware** (cookies `__uzm*`): hace **dos** cosas distintas que
  vimos en vivo:
  1. **Fingerprint del cliente HTTP** → **cuelga a axios** (timeout de 60s) pero
     **deja pasar a `fetch`/undici** (200 OK). Distinto TLS/HTTP fingerprint.
  2. **Throttle por volumen a nivel de conexión** → tras muchos requests desde
     una IP, la conexión TCP **no se establece** (`UND_ERR_CONNECT_TIMEOUT`, ~10s
     y corta). Esto NO mira headers ni fingerprint: mira la IP.

## 3. Qué ya tiene PJ (aplicado)

- **`fetch` (undici) en vez de axios** (`services/pj/`) — vence el fingerprint #1.
  Este fue el hallazgo clave: el mismo request con axios se cuelga y con fetch pasa.
- **Cookie jar** — mantiene las cookies `__uzm*` del bot manager entre requests
  (SPIJ no lo necesita; PJ sí).
- **Throttle + backoff + reanudación por ledger** — reusa la higiene de SPIJ.

## 4. Qué puede ayudar más a PJ (propuestas)

Ordenadas por relación valor/riesgo:

1. **Headers de navegación completos (barato, aplicado en esta revisión).** SPIJ
   manda `Origin`/`Referer`; PJ mandaba solo `Accept`/`Accept-Language`. Añadir
   los headers que un Chrome real envía al navegar (`Sec-Fetch-*`, `sec-ch-ua`,
   `Upgrade-Insecure-Requests`) hace la request indistinguible de una navegación
   real y reduce los challenges por fingerprint. Ver `constants/http`.
2. **Ritmo más suave para el crawl.** El throttle por volumen (#2) se dispara por
   cantidad de requests/tiempo desde la IP. `PJ_DELAY` más alto (p.ej. 1.5–3s) y
   crawl estrictamente secuencial bajan la probabilidad de que salte. Es lo que
   más mueve la aguja contra el bloqueo por IP, junto con la IP misma.
3. **Correr desde IP residencial/oficina.** El throttle por conexión (#2) **no se
   evita con código** — es la IP. El navegador del owner entra normal porque su
   IP+sesión no está marcada. Correr el scraper desde esa red (no datacenter) es
   la mitigación real. El ledger hace que, si igual lo cortan a mitad, retome.
4. **Fallback Puppeteer para páginas que fallen.** Puppeteer ya es dependencia:
   un navegador real tiene el fingerprint TLS/JS más creíble y ejecuta el JS del
   bot manager. Útil contra challenges de fingerprint (#1) más duros. **Ojo:** NO
   vence el throttle por IP (#2) — si la IP está cortada, Puppeteer tampoco conecta.
   Es más pesado (lanza Chromium), así que va como *fallback*, no como default.
5. **(Avanzado) Impersonation de TLS.** El informe de fuentes cita la lección del
   repo ONPE: `curl_cffi impersonate="chrome124"` (Python). En Node el equivalente
   sería una lib tipo `got-scraping`/`cycletls` que imita el fingerprint TLS de
   Chrome. Hoy no hace falta (undici `fetch` ya pasa); anotarlo por si Radware
   endurece el fingerprint.

## 5. Bottom line honesto

- El **fingerprint del cliente** (por qué axios se colgaba) **ya está resuelto**
  con `fetch` + los headers de navegación completos.
- El **throttle por IP/volumen** (lo que nos frenó hoy) **no tiene solución de
  código**: se maneja con **ritmo suave + IP residencial + corridas reanudables**.
  Es exactamente lo que el plan de fuentes advertía (§5). No es que PJ esté mal
  hecho; es que su sitio es hostil de una forma que SPIJ nunca fue.
- La mejor "copia" del trabajo del compañero para PJ no es un truco puntual, sino
  su **filosofía**: parecer un cliente legítimo (headers), ir suave (throttle/
  concurrencia baja), retirarse ante rechazo (backoff) y **poder reanudar**
  (ledger) para minimizar requests totales.
