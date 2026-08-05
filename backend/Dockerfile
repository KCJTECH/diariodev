# Diário Dev — imagem de produção (API + frontend estático).
# IMPORTANTE: o contexto de build é a RAIZ do projeto (para incluir o frontend).
# Ver docker-compose.yml (context: .., dockerfile: backend/Dockerfile).
# Build multi-stage, usuário não root. Encerramento gracioso no server.ts.

FROM node:22-slim AS builder
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
# Frontend estático (servido pela API na mesma origem)
COPY *.dc.html ./frontend/
COPY support.js ./frontend/
COPY assets ./frontend/assets/
ENV FRONTEND_DIR=/app/frontend
# Usuário não root e diretório de anexos
RUN useradd --system --uid 10001 dv && mkdir -p /app/storage && chown -R dv /app/storage /app/frontend
USER dv
EXPOSE 3333
# API. Para o worker, sobreponha: node dist/src/workers/index.js
CMD ["node", "dist/src/server.js"]
