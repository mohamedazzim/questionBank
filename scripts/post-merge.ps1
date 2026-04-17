$ErrorActionPreference = "Stop"

pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
