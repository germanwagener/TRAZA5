FROM node:24-bookworm-slim
WORKDIR /app
ADD traza5-admin-edicion.tar.gz /app/
COPY patch.b64.* /tmp/
RUN cat /tmp/patch.b64.* | base64 -d | tar -xzf - -C /app && rm -f /tmp/patch.b64.*
COPY admin-delete.tar.gz.b64 /tmp/admin-delete.tar.gz.b64
RUN base64 -d /tmp/admin-delete.tar.gz.b64 | tar -xzf - -C /app && rm -f /tmp/admin-delete.tar.gz.b64
COPY shared-stock/ /app/gestion-integrada/
WORKDIR /app/gestion-integrada
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["node", "online.mjs"]
