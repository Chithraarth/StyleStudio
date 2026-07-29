# syntax=docker/dockerfile:1
#
# Pure reverse proxy — unlike a static-site nginx image, there's no frontend
# build baked in here: the web app runs as its own live `vite preview`
# container (see ../web/Dockerfile) so its Open Graph share-link rendering
# keeps working. This image is just nginx + certbot's bootstrap script.

FROM nginx:1.27-alpine
# openssl mints a throwaway cert on first boot, so nginx can start (and serve
# the ACME http-01 challenge) before certbot has ever run — see entrypoint.sh.
RUN apk add --no-cache openssl
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]
