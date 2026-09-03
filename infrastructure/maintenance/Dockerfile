FROM containrrr/watchtower:1.7.1 AS watchtower

FROM postgres:17.5-alpine

RUN apk add --no-cache ca-certificates docker-cli tzdata

COPY --from=watchtower /watchtower /usr/local/bin/watchtower
COPY infrastructure/maintenance/entrypoint.sh /usr/local/bin/maintenance-entrypoint
COPY infrastructure/maintenance/update.sh /usr/local/bin/la-vie-update

RUN chmod 0755 \
    /usr/local/bin/watchtower \
    /usr/local/bin/maintenance-entrypoint \
    /usr/local/bin/la-vie-update

ENTRYPOINT ["/usr/local/bin/maintenance-entrypoint"]
