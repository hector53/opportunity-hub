# Continuidad: Opportunity Hub

Última actualización: 2026-10-14 · Estado: **M1.0 endurecido en `m1/discovery-poc`, pendiente de revisión antes de OAuth real**.

## 1. Qué se verificó (ejecutado de verdad en esta sesión)

Entorno: macOS (máquina de desarrollo), Node 22.14, Docker 27.5, Docker Desktop con 4 CPU y 3 GB. **No se ha desplegado en la VM de GCE**: ver `docs/DEPLOYMENT.md`.

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck` | 0 errores, 0 warnings |
| `npm test` (Vitest) | 93/93 |
| `npm run build` | Turbopack local bloqueado por permisos del sandbox al enlazar el puerto auxiliar de PostCSS; `npx next build --webpack` pasa. El build Docker no se tocó. |
| `npm run test:e2e` (Playwright) contra `next dev` y contra Docker | 3/3. Incluye la aserción «ninguna petición a dominios externos» |
| Sync real Get on Board | 643 recibidas, 185 nuevas y 154 omitidas (no remotas) en ~22 s. La segunda corrida es idempotente: 0 nuevas |
| Sync desde la UI (Sources → Sincronizar ahora) | OK |
| `docker compose restart` y `down` + `up` | Datos intactos (volumen `pgdata`) |
| `AUTH_DISABLED=true` en producción | El servidor no arranca (guard en `instrumentation.ts`) |
| Sin sesión | Las páginas redirigen a `/login`; `/api/*` responde 401 |
| Overflow horizontal a 390 y 1440 px en todas las páginas | Ninguno |
| Consumo en reposo | app ≈ 45 MB, db ≈ 60 MB |

**No verificado:** generación de propuestas con IA real (no había `OPENROUTER_API_KEY`); despliegue en la VM; scheduler ejecutándose tras 6 h (la lógica arranca y el log muestra `[scheduler] started`, pero no esperé al intervalo).

## 2. Decisiones tomadas (defaults razonables)

- **Drizzle** en lugar de Prisma: sin motor binario, menos RAM y migraciones SQL.
- **Next 16.3.5**, React 19.2, Tailwind 4.3, Zod 4, Vitest 4, ESLint 9. Todas las versiones tienen más de 2 semanas. Se usa `.npmrc legacy-peer-deps=true` porque `eslint-plugin-import` aún no declara compatibilidad con ESLint 10 y npm 10.9 falla en el árbol de peers.
- `src/proxy.ts`: en Next 16 `middleware` pasó a llamarse `proxy` y corre en Node. Además, cada server action llama a `assertAuthenticated()` como defensa en profundidad.
- **Scheduler en proceso** (`instrumentation.ts` → `server/scheduling/scheduler.ts`): hace un tick cada 5 min, purga contenido Upwork expirado aunque se desactive Get on Board y sincroniza si `lastRunAt` es más antiguo que `intervalMinutes`. Un advisory lock de Postgres sobre una conexión reservada evita solapes entre búsqueda y desconexión. No hay Redis ni colas; durante un apagado la purga espera al siguiente arranque.
- **Dedupe:** `source:id:<externalId>` → `url:<canónica>` → hash del contenido. Las coincidencias entre fuentes (mismo título + empresa) sólo se marcan como «Posible duplicado»; nunca se fusionan.
- **Ediciones manuales:** se marcan con `provenance[campo].kind = "manual"`, y `ingestion/merge.ts` las preserva en las re-syncs.
- **Inferencia de tipo de cliente:** conservadora. Prioriza las autodescripciones explícitas en la vacante y, si no las hay, la descripción de la empresa. La primera versión era demasiado agresiva («Studio», «agency» en una aseguradora) y se corrigió: ahora unas 160 de 185 quedan en `unknown`, que es lo correcto.
- **Salarios de GoB:** se asumen en USD/mes y se marcan así en la procedencia.
- **Hash de contraseña** con formato `scrypt:salt:hash`, porque Compose interpola `$` en `env_file` (verificado).
- **Perfil personal:** fuera del repo, en `config/profile.local.json` (git-ignored). El seed lo carga si existe; los defaults del código son un perfil de ejemplo genérico.
- **Datos Demo:** se guardan con `is_demo = true`, títulos `[Demo] …` y badge morado. Se excluyen de Experiments y se borran desde Settings o con `db:seed -- --clear-demo`.

## 3. Cómo retomar

```bash
cd opportunity-hub
docker compose up -d                 # app en http://127.0.0.1:3100
git log --oneline                    # hitos
npm ci && npm test                   # dev local
```

Mapa rápido: `README.md` (arquitectura), `src/server/db/schema.ts` (modelo), `src/server/ingestion/pipeline.ts` (flujo central), `src/server/scoring/engine.ts`, `src/server/security/risk-rules.ts`.

Para añadir una fuente: crear `server/connectors/<x>/` con un mapper a `NormalizedOpportunity` (`server/normalization/types.ts`), llamar a `ingestOpportunity()` y registrarla en `connectors/registry.ts`.

## 4. Pendientes y mejoras de M0 (pequeñas)

- [ ] Desplegar en la VM siguiendo `docs/DEPLOYMENT.md` (requiere acceso SSH).
- [ ] Probar la IA con una clave real de OpenRouter y verificar el ID del modelo.
- [ ] El menú móvil (`<details>`) no se cierra solo al navegar.
- [ ] El Kanban usa un selector «Mover» en vez de drag & drop (es accesible y funciona, pero no se arrastra).
- [ ] Afinar las reglas de inferencia y de riesgo con datos reales (pueden dar falsos positivos, como «urgent» en un texto normal).
- [ ] Más tests de integración con DB real (hoy cubiertos por el E2E).

## 5. Plan M1: descubrimiento primero

1. **Upwork MCP M1.0:** OAuth propio separado de Codex, transacción `state` de un solo uso vinculada al usuario, PKCE, tokens cifrados, allowlist de `list_accounts` y `find_jobs`, búsquedas manuales, TTL de 23 h y purga compatible con los términos. OAuth real queda pendiente de confirmación personal; el scope efectivo del proveedor aún no está confirmado.
2. **Conectores web autorizados:** diseñar Playwright sólo para sitios que permitan automatización; no Upwork/Workana sin autorización adicional. Sin descargas, propuestas, mensajes ni ejecución de contenido.
3. **Workana:** mantener importación manual y estudiar sólo APIs/MCP o alertas oficiales autorizadas.
4. **Gmail OAuth:** queda después de validar discovery y el dashboard; scope mínimo read-only, sin descargar adjuntos.
5. **Clasificación/correlación de emails:** después de Gmail, siempre como propuestas revisables, nunca cambios o envíos silenciosos.
6. **Recordatorios:** sólo tras decidir si se permiten notificaciones o emails salientes.

## 6. M2 (posterior)

Scoring con IA como segunda opinión (tabla `opportunity_scores` con `method = 'ai'` ya prevista), experimentos A/B con asignación de variantes, alertas de oportunidades destacadas y aprendizaje a partir de resultados con salvaguardas estadísticas.
