export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function nowTs(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function validYmd(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // evita el mapeo legacy de años 0–99 de Date.UTC
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // p.ej. 31/02
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${p(mo)}-${p(d)}`;
}

/**
 * Normaliza una fecha a ISO `YYYY-MM-DD`, que es lo que exige el endpoint de
 * ingesta (Pydantic `date`). Devuelve null si no se puede interpretar.
 *
 * SPIJ hoy envía `fechaPublicacion` en ISO (`YYYY-MM-DD`), pero blindamos otros
 * formatos habituales para no provocar 422: datetime ISO (con hora/zona),
 * `YYYY/MM/DD`, y `DD/MM/YYYY` o `DD-MM-YYYY`. Ante la ambigüedad `NN/NN/YYYY`
 * se asume día-primero (convención peruana).
 */
export function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // ISO date o datetime: tomamos solo la parte de fecha.
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);

  // YYYY/MM/DD
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY o DD-MM-YYYY (día primero)
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return validYmd(+m[3], +m[2], +m[1]);

  // Último recurso: dejar que el motor intente (ISO con zona rara, etc.).
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
