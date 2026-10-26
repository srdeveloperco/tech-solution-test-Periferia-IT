# syntax=docker/dockerfile:1.7
# Imagen única: backend (Bun + Hono) que también sirve el front compilado.

ARG BUN_VERSION=1.4.4

# ── 1) Dependencias completas (para compilar el front) ───────────────────────
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
# --ignore-scripts: el "prepare" instala git hooks, no aplica dentro de la imagen.
RUN bun install --frozen-lockfile --ignore-scripts

# ── 2) Build del front ───────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN bun run --filter @oc/web build

# ── 3) Runtime: solo dependencias de producción + fuentes del backend ────────
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY package.json bun.lock tsconfig.base.json tsconfig.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
# Bun 1.4 instala en modo aislado (node_modules por workspace → node_modules/.bun): se instala aquí mismo.
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY packages ./packages
COPY apps/backend ./apps/backend
COPY fixtures ./fixtures
COPY --from=build /app/apps/web/dist ./apps/web/dist

# out/ (control.csv, log.jsonl, sap/, evidencias, observatorio.db) es efímero dentro del contenedor.
RUN mkdir -p /app/out && chown -R bun:bun /app/out
USER bun

EXPOSE 8080
CMD ["bun", "apps/backend/src/main.ts"]
