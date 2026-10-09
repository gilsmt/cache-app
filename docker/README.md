# Docker Setup for Cache

Self-host Cache with Docker for total control over your data. Cache has zero telemetry by default.

> Run all commands from the **repo root**.

## Quickstart

### Production (app + PostgreSQL + Redis)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — set SELF_HOSTED=true and at minimum set BETTER_AUTH_SECRET, GEMINI_API_KEY, DATABASE_URL, REDIS_URL

# 2. Build and start
# --env-file .env makes Compose read the repo-root .env for interpolation;
# the compose files' own env_file entries load it as the container env.
docker compose --env-file .env -f docker/production/docker-compose.yml up --build
```

Open [http://localhost:3000](http://localhost:3000).

By default the compose stack brings up its own PostgreSQL and Redis. To use an **external** database, set `DATABASE_URL` / `REDIS_URL` in `.env` — the compose interpolation honours your values over the built-in defaults.

### Development (hot reload)

```bash
docker compose --env-file .env -f docker/development/docker-compose.yml up --build
```

Source changes on the host reload inside the container. `node_modules` and `.next` are kept in anonymous volumes so they aren't shadowed by the host's.

## Files

- `Dockerfile` — Production multi-stage build (`next build --output standalone`)
- `Dockerfile.dev` — Development image
- `start.sh` — Runs `prisma migrate deploy` then the standalone server
- `build.sh` — Build the image without compose
- `production/docker-compose.yml` — App + Postgres + Redis
- `development/docker-compose.yml` — Dev setup with bind mount + polling

## Notes for self-hosters

- **SELF_HOSTED=true** disables Stripe subscription endpoints and grants full application access. Stripe keys are not needed in this mode.
- **Database credentials:** the compose defaults (`postgres:postgres`) are fine for local testing. For anything internet-facing, set `POSTGRES_PASSWORD` (and optionally `POSTGRES_USER` / `POSTGRES_DB`) in `.env`. The DB/Redis ports are not published to the host — the `app` service reaches them over the compose network. To use host tools (`psql`, `redis-cli`) against the stack, add `ports: ["127.0.0.1:5432:5432"]` / `["127.0.0.1:6379:6379"]` to the `db` / `redis` services (loopback-only, never `"5432:5432"`).
- **i18n:** the Docker build intentionally skips `gt translate` (General Translation), which calls their API at build time and requires `GT_API_KEY`. If you want translated strings baked into the image, run `bunx gt translate` locally before building and commit the generated message files.
- **Prisma migrations** run automatically on container start via `start.sh`. The image does not include the full `node_modules` at runtime — `prisma` is invoked via `bunx` for migrations only.

See `.env.example` for the full environment variable reference.
