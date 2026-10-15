# Security notes & public-deployment checklist

Opportunity Hub is designed to run privately (bound to `127.0.0.1`, accessed through an SSH tunnel). Before exposing it publicly, go through this list.

## Authentication model

- Single user. The password is verified against an scrypt hash (`APP_PASSWORD_HASH`); the session is an HMAC-signed, `httpOnly`, `SameSite=Strict` cookie valid for 7 days.
- Every route goes through `src/proxy.ts`, and every server action calls `assertAuthenticated()` as well.
- Logout deletes the cookie. Sessions are stateless: **rotate `AUTH_SECRET` to revoke all sessions** (for example if a device is lost).
- Login throttling is in memory and counts **failed** attempts only: 5 per client key and 30 globally per 15 minutes. The global cap protects against distributed attempts and header spoofing. A restart resets the counters, which is acceptable for a single instance.
- The post-login redirect only accepts same-app relative paths (no `//host`, `/\host` or schemes).
- `AUTH_DISABLED=true` is refused in production: the server won't start.

## Upwork MCP OAuth (M1.0)

- Opportunity Hub uses its own Upwork OAuth client and callback. Codex client metadata, tokens, cookies and sessions are never read or reused.
- The authorization transaction uses an encrypted, short-lived `state` cookie plus a server-side one-time transaction bound to the authenticated user/session, exact `redirect_uri` and `client_id` validation, and PKCE `S256`. The `oh_session` cookie remains `SameSite=Strict`; the exact OAuth callback is the only proxy exception because the provider's cross-site redirect omits that cookie. The callback cannot proceed without the encrypted transaction cookie, its database row and the one-time claim.
- Access and refresh tokens are stored only as AES-256-GCM ciphertext using `UPWORK_MCP_TOKEN_ENCRYPTION_KEY`; they are not placed in logs, search parameters or the repository. Expired access tokens refresh when possible; rejected credentials become an error state and require reauthorization.
- The MCP transport has a hard runtime allowlist of `list_accounts` and `find_jobs`; write-capable tools are not exposed. This is an application-side operation allowlist, not proof that an Upwork access token is read-only. Sources labels the requested/granted OAuth scope separately and states when the provider has not confirmed effective permissions. Searches are manual, limited to 10 results, rate-limited and retried only once for transient responses.
- Upwork content is treated as untrusted data, stored without `rawPayload`, expires after 23 hours and is redacted on expiry or disconnect. Purging removes source records, scores, risk evidence, linked proposals, application events, linked Upwork messages, associated activity entries, and AI cache rows tied to the opportunity; user status/notes/tags remain in a generic shell. External URLs are only shown through the existing confirmation UI; no content is opened, executed, downloaded or submitted automatically.
- A company row is deleted when it was used only by the expired Upwork opportunity; a shared company row is retained because it may contain user-owned or non-Upwork data.
- The retention worker runs independently of dashboard visits and starts on server boot, then every five minutes, even when scheduled Get on Board sync is disabled. If the process is stopped, no in-process job can purge data during the outage; the next startup purge is the recovery boundary.

## Proxy headers (`TRUST_PROXY`)

`X-Forwarded-For` and `X-Real-IP` can be set by any client. Opportunity Hub **ignores them by default**, so every login attempt shares the `direct` throttle bucket, which is correct when only you reach the app through a tunnel.

Set `TRUST_PROXY=true` only when **all** of the following are true:

1. The app is reachable **only** through a reverse proxy you control. The app port stays bound to `127.0.0.1` and the firewall is closed.
2. That proxy **overwrites** (not appends to) `X-Real-IP`, or appends the real client address as the last `X-Forwarded-For` hop.

With `TRUST_PROXY=true`, the app uses `X-Real-IP`, or else the **last** `X-Forwarded-For` entry, and never the first (client-controlled) one.

## Public deployment checklist

- [ ] TLS reverse proxy (Caddy/nginx) in front of `127.0.0.1:3100`; app and DB ports stay on localhost.
- [ ] `COOKIE_SECURE=true` (also enables the HSTS header).
- [ ] `TRUST_PROXY=true` only if the conditions above hold.
- [ ] Strong `APP_PASSWORD_HASH` (12+ characters, unique) and a fresh 48-byte `AUTH_SECRET`.
- [ ] Ideally an extra access layer (Cloudflare Access, Google IAP, Tailscale or VPN) so the login page isn't on the open internet.
- [ ] Server actions behind a proxy: Next.js checks that `Origin` matches the forwarded host. If the proxy rewrites hosts, configure `experimental.serverActions.allowedOrigins` in `next.config.ts`.
- [ ] Firewall: only 443 (and SSH) open; Postgres never exposed.
- [ ] Backups of the `pgdata` volume, stored encrypted.
- [ ] Check `docker compose logs app` for `[auth] failed login` bursts.

## HTTP headers

CSP (`default-src 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`, `base-uri 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and HSTS when `COOKIE_SECURE=true`. `script-src` keeps `'unsafe-inline'` because Next.js hydration uses inline scripts; a nonce-based CSP is a possible future hardening step.

## Untrusted content

Job posts, notifications and URLs are only ever **parsed as text**. The Security Gate analyzes URLs statically (scheme, raw IPs, punycode, shorteners, executables/archives, repositories, embedded credentials, platform-domain mismatch). It never fetches or opens them, and it never runs third-party code.

## Reporting

Please report vulnerabilities privately through GitHub's "Report a vulnerability" (Security tab) rather than in a public issue.
