#!/bin/sh
set -e

: "${DOMAIN:?DOMAIN environment variable must be set}"

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

# certbot writes real certs to this same path (in the shared certbot_conf
# volume). On first-ever boot nothing has issued a cert yet, so nginx would
# fail to start (ssl_certificate pointing at a missing file) before certbot
# even gets a chance to run its http-01 challenge on port 80. Mint a
# throwaway self-signed cert so nginx can come up immediately; once you run
# `certbot certonly` (see README instructions), the real cert overwrites
# these files and a container restart picks it up.
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "No certificate for ${DOMAIN} yet — generating a temporary self-signed one."
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
fi

exec /docker-entrypoint.sh nginx -g "daemon off;"
