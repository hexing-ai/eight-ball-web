FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts ./
COPY shared ./shared
COPY server ./server
COPY test ./test
COPY scripts ./scripts
COPY web ./web
COPY licenses ./licenses
COPY THIRD_PARTY_NOTICES.md ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567 DATA_DIR=/app/data STATIC_DIR=/app/web-dist
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/web-dist ./web-dist
COPY --chown=node:node package*.json THIRD_PARTY_NOTICES.md ./
COPY --chown=node:node licenses ./licenses
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node", "dist/server/main.js"]
