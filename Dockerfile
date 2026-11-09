FROM node:24-bookworm-slim
WORKDIR /app
ADD traza5-admin-edicion.tar.gz /app/
COPY patch.b64.* /tmp/
RUN cat /tmp/patch.b64.* | base64 -d | tar -xzf - -C /app && rm -f /tmp/patch.b64.*
COPY admin-delete.tar.gz.b64 /tmp/admin-delete.tar.gz.b64
RUN base64 -d /tmp/admin-delete.tar.gz.b64 | tar -xzf - -C /app && rm -f /tmp/admin-delete.tar.gz.b64
COPY shared-stock/ /app/gestion-integrada/
WORKDIR /app/gestion-integrada
RUN node -e "const fs=require('fs');const html='public/index.html';let page=fs.readFileSync(html,'utf8');const oldApp='app.js?v=stock-20261102-3';if(!page.includes(oldApp))throw Error('Referencia de app.js inesperada');page=page.replace(oldApp,'app.js?v=audit-20261109-7');fs.writeFileSync(html,page);const sw='public/sw.js';let worker=fs.readFileSync(sw,'utf8');if(!worker.includes('traza-shell-v13')||!worker.includes('app.js?v=audit-20261109-1'))throw Error('Caché del service worker inesperada');worker=worker.replace('traza-shell-v13','traza-shell-v14').replace('app.js?v=audit-20261109-1','app.js?v=audit-20261109-7');fs.writeFileSync(sw,worker);"
RUN npm install --no-save --ignore-scripts --omit=optional --package-lock=false pdfjs-dist@6.4.299
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["node", "start-juni.mjs"]
