# syntax=docker/dockerfile:1
# Derleme: TypeScript → dist.
# better-sqlite3 paketin içinde hazır derlenmiş binary'lerle gelir (linux x64/arm64, glibc/musl);
# install script'i yalnızca node-gyp ile yeniden derlemeye çalışır, bu yüzden script'ler kapalı.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/rafta.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Root olarak başlar, /data izinlerini düzeltir ve node kullanıcısına geçer (bkz. docker-entrypoint.sh).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
