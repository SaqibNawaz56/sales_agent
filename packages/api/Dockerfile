FROM node:24-alpine

WORKDIR /app

# Manifests first so dependency install caches independently of source edits.
COPY package.json package-lock.json ./
# Both workspace manifests are needed: npm ci validates the lockfile against
# every workspace it declares, and fails as "out of sync" if one is absent.
COPY packages/api/package.json ./packages/api/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# npm ci pins to the lockfile so container and host resolve identical versions.
RUN npm ci --workspace @sales-agent/api --include-workspace-root

COPY packages/api ./packages/api

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace", "packages/api"]
