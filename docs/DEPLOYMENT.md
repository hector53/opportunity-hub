# Deploying on a shared Linux VM

Opportunity Hub is designed to run next to other services on a small VM without interfering with them. It uses its own Compose project (`name: opportunity-hub`), network, volume and ports, and binds only to `127.0.0.1`.

> **Never stop, restart or modify existing services on the host.** If a port is taken, change this app's port instead.

## 1. Read-only pre-flight checks

```bash
docker --version && docker compose version
df -h ~ && free -m && nproc
ss -ltnp | grep -E ':(3100|5434)\b' || echo "3100/5434 are free"
docker ps --format '{{.Names}}\t{{.Ports}}'      # look, don't touch
```

If a port is in use, set `APP_HOST_PORT` / `DB_HOST_PORT` in `.env`.

## 2. Code and configuration

```bash
git clone https://github.com/hector53/opportunity-hub.git ~/apps/opportunity-hub
cd ~/apps/opportunity-hub
cp .env.example .env && chmod 600 .env
# Fill in POSTGRES_PASSWORD (also inside DATABASE_URL), AUTH_SECRET and APP_PASSWORD_HASH
openssl rand -base64 48            # → AUTH_SECRET
docker compose --profile tools run --rm tools npm run auth:hash -- 'a long password'
```

The hash format is `scrypt:salt:hash`. It contains no `$`, so Docker Compose won't alter it when it reads `.env`.

Optional private profile: copy your profile JSON to `config/profile.local.json`. That path is git-ignored, and the first seed loads it.

## 3. Start

```bash
docker compose up -d --build                      # applies migrations on start
docker compose --profile tools run --rm tools npm run db:seed
docker compose ps                                 # app and db "healthy"
curl -s http://127.0.0.1:3100/api/health          # {"ok":true}
```

Idle footprint measured locally: app ≈ 45 MB, Postgres ≈ 60 MB. Memory limits: 512 MB (app) and 256 MB (db).

## 4. Access from your laptop (no public ports)

Forward port 3100 with VS Code Remote SSH (*Ports* → *Forward a Port*), or with plain SSH:

```bash
ssh -N -L 3100:127.0.0.1:3100 user@your-vm
```

Then open `http://localhost:3100`. Keep `COOKIE_SECURE=false` while the app is served over plain HTTP through the tunnel.

## 5. Operations

```bash
docker compose logs -f app            # includes [migrate] and [scheduler]
docker compose restart app            # only this project
docker compose down                   # keeps data (pgdata volume)
# NEVER: docker compose down -v       (deletes the database)
docker compose exec -T db pg_dump -U hub opportunity_hub | gzip > backup-$(date +%F).sql.gz
```

## 6. Going public (not configured)

To expose the app, put a TLS reverse proxy (Caddy/nginx) in front of `127.0.0.1:3100`, set `COOKIE_SECURE=true`, restrict the firewall, and preferably add an access layer such as Cloudflare Access or IAP.
