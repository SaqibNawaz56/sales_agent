FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# Every workspace manifest: npm ci validates the lockfile against all of them
# and fails as "out of sync" if one is missing.
COPY packages/web/package.json ./packages/web/
COPY packages/api/package.json ./packages/api/
COPY packages/mcp-server/package.json ./packages/mcp-server/

RUN npm ci --workspace @sales-agent/web --include-workspace-root

COPY packages/web ./packages/web

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "packages/web"]
