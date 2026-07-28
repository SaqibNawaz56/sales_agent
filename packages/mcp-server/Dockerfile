FROM node:24-alpine

WORKDIR /app

# Manifests first so dependency install caches independently of source edits.
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/

# npm ci, not npm install: installs exactly what the lockfile pins, so the
# container and the host resolve identical versions. Risk R8 is version churn.
RUN npm ci

# Generate the Prisma client here, inside Linux. Generating on the Windows host
# produces the wrong query-engine binary for this runtime.
COPY packages/mcp-server/prisma ./packages/mcp-server/prisma
RUN npx prisma generate --schema packages/mcp-server/prisma/schema.prisma

COPY packages/mcp-server ./packages/mcp-server

EXPOSE 3001

CMD ["npm", "run", "dev", "--workspace", "packages/mcp-server"]
