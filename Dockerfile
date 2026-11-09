FROM node:24-bookworm-slim
WORKDIR /app
ADD traza5-admin-edicion.tar.gz /app/
COPY patch.b64.* /tmp/
RUN cat /tmp/patch.b64.* | base64 -d | tar -xzf - -C /app && rm -f /tmp/patch.b64.*
COPY admin-delete.tar.gz.b64 /tmp/admin-delete.tar.gz.b64
RUN base64 -d /tmp/admin-delete.tar.gz.b64 | tar -xzf - -C /app && rm -f /tmp/admin-delete.tar.gz.b64
COPY shared-stock/ /app/gestion-integrada/
WORKDIR /app/gestion-integrada
RUN node -e "const fs=require('fs');const app='public/app.js';let js=fs.readFileSync(app,'utf8');const remember='<label><input type=\"checkbox\" name=\"remember\"> Recordar a Juni en este navegador privado hasta cerrar sesión o revocar el acceso</label>';if(!js.includes(remember))throw new Error('No se encontró el control de Juni');fs.writeFileSync(app,js.replace(remember,''));const html='public/index.html';let page=fs.readFileSync(html,'utf8');page=page.replace('app.js?v=stock-20261102-3','app.js?v=audit-20261109-1');fs.writeFileSync(html,page);"
RUN npm install --no-save --ignore-scripts --omit=optional --package-lock=false pdfjs-dist@6.4.299
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["node", "start-juni.mjs"]
