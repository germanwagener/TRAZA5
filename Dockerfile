FROM node:24-bookworm-slim
WORKDIR /app
ADD traza5-admin-edicion.tar.gz /app/
WORKDIR /app/gestion-integrada
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["node", "online.mjs"]
