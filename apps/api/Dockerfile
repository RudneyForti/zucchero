FROM node:22-alpine AS dependencies

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY apps/api apps/api

RUN rm -f apps/api/*.tsbuildinfo && pnpm --filter @confeitaria/api build

FROM dependencies AS tools

COPY apps/api apps/api

WORKDIR /workspace/apps/api

CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed"]

FROM node:22-alpine AS runtime

ENV NODE_ENV=development
ENV PORT=3001

WORKDIR /workspace

COPY --from=dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json

USER node
WORKDIR /workspace/apps/api

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
