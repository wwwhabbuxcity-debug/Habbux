#!/bin/sh
set -eu
# Hook exclusivo desta lineage; não modifica configuração de outros sites.
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/tyvo.online ] || exit 0
/usr/sbin/nginx -t
/bin/systemctl reload nginx
