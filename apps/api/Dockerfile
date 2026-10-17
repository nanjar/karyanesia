FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @karyanesia/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w @karyanesia/api
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY packages/database/migrations ./packages/database/migrations
USER node
EXPOSE 4000
CMD ["node","apps/api/dist/main.js"]
