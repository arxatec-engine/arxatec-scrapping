#!/usr/bin/env bash
# Campaña de scraping para la VM (ver docs/campania-vm.md).
#
# USO:
#   ./ops/campaign.sh            # una pasada manual (lo mismo que hace el timer)
#   sudo systemctl start arxatec-scraping.service   # una pasada vía systemd
# No lleva argumentos: siempre corre la pasada COMPLETA.
#
# Qué hace: `pnpm all --todos --skip pj`, es decir TODOS los módulos de
# documentos en el orden de DOC_SCRAPERS (entidades primero; pequeño-primero,
# con elperuano y spij al final), + respaldo rotado de state/ + pnpm status.
# La lista viva de módulos está en src/cli.ts (DOC_SCRAPERS) — este script no
# la duplica a propósito: añadir un módulo allí lo mete en la campaña solo.
#
# PJ va excluido (su bot manager bloquea IPs de datacenter; se corre aparte
# desde una IP residencial) y gobpe también (decisión del owner: fuera de
# `all`; se corre a mano). Todo es reanudable por ledger: si la pasada muere
# a medias, la siguiente retoma exactamente donde quedó, y cuando ya no hay
# nada nuevo la pasada es un "NADA NUEVO" barato.
#
# El timer de systemd (ops/arxatec-scraping.timer) relanza este script cada
# 6 horas — ese es el supervisor: nadie tiene que reiniciar nada a mano.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "[campaign] $(date -Is) inicio de pasada"
pnpm all --todos --skip pj
estado=$?
echo "[campaign] $(date -Is) pasada terminada (exit=$estado)"

# Respaldo rotado del estado (regla A1: state/ es el activo de producción —
# perder los ledgers sí sería grave). Se conservan los últimos 14.
mkdir -p state/backups
stamp=$(date +%Y%m%d_%H%M%S)
tar -czf "state/backups/campaign_${stamp}.tar.gz" \
  --exclude="state/backups" state 2>/dev/null \
  && echo "[campaign] respaldo state/backups/campaign_${stamp}.tar.gz"
ls -1t state/backups/campaign_*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --

pnpm status

exit "$estado"
