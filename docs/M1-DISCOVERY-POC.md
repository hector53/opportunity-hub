# M1 — descubrimiento autónomo: estudio técnico y PoC

Fecha del estudio: 2026-10-14
Rama: `m1/discovery-poc`
Estado: **PoC viable para descubrimiento read-only; integración propia aún no implementada**

## Decisión de alcance

M1 empieza por descubrir oportunidades, no por Gmail. La primera versión debe poder ejecutar una búsqueda bajo demanda mediante conectores autorizados, convertir resultados a `NormalizedOpportunity` y reutilizar el pipeline existente de deduplicación, scoring y Security Gate.

Esta rama no añade todavía un cliente OAuth persistente, workers, scheduler de búsquedas ni navegación contra plataformas de trabajo. La conexión real de Upwork se probó desde Codex sólo para validar viabilidad y catálogo de herramientas.

## 1. Upwork MCP oficial

### Evidencia obtenida

- `GET https://mcp.upwork.com/mcp` sin token responde `401` y anuncia `https://mcp.upwork.com/.well-known/oauth-protected-resource/mcp`.
- La metadata pública identifica el recurso como `https://mcp.upwork.com/mcp` y el servidor de autorización como `https://mcp.upwork.com`.
- La metadata OAuth publica autorización en `https://www.upwork.com/ab/account-security/oauth2/authorize`, token en `https://www.upwork.com/api/v3/oauth2/token`, PKCE `S256`, y soporte de Client ID Metadata Documents.
- Codex completó una conexión OAuth independiente y la enumeración devolvió 30 herramientas. No se copiaron tokens, cookies ni sesiones al repositorio.
- Una búsqueda read-only real con `list_accounts` + `find_jobs(action=search)` devolvió 3 oportunidades, `hasNextPage=true` y cursor `3`. La respuesta incluía título, URL, ID, fechas, skills, modalidad, presupuesto/propuestas y datos agregados del cliente.

Fuentes oficiales: [MCP de Upwork](https://mcp.upwork.com/mcp), [ayuda oficial sobre Upwork MCP](https://support.upwork.com/hc/en-us/articles/55446516654611-How-to-use-Upwork-with-AI-agents-through-MCP), [documentación API](https://www.upwork.com/developer/documentation/graphql/api/docs/index.html), [términos API/MCP](https://www.upwork.com/legal).

### Herramientas relevantes

El servidor también expone operaciones de escritura. La aplicación no debe entregar el catálogo completo a un agente. Para discovery se allowlistean únicamente:

- `list_accounts`: obtiene el `org_uid` de la cuenta seleccionada.
- `find_jobs`: `search`, `get` y `smart_search`; el propio servidor marca la herramienta como `read_only`.

Quedan fuera de la integración de discovery `manage_proposals`, `confirm_preview`, `send_message`, `save_job`, `get_freelancer_financials`, `update_profile`, uploads, ofertas, contratos y cualquier otra herramienta que modifique estado, envíe mensajes o exponga datos innecesarios.

La allowlist está codificada en `src/server/connectors/upwork/mcp-policy.ts`.

### Capacidades y límites observados

`find_jobs` permite:

- `search` por texto, título, skills, categoría, modalidad, tarifa/presupuesto, experiencia, propuestas, cliente, zona horaria y ubicación.
- `get` de una oportunidad concreta por ID o URL para obtener detalles adicionales.
- `smart_search` personalizado para el freelancer, con `best_match` y `most_recent`.
- Máximo 10 resultados por página, con cursor; skills limitadas a 5.
- Filtros de fecha sólo en `smart_search` + `most_recent`; `search` no tiene filtro de fecha.

El `get_tool_help` del MCP **no documenta límite de tasa, cuota, comportamiento de 429, retención ni borrado**. Por eso la PoC no implementa polling ni asume que los límites de la API REST aplican al MCP. La documentación pública de la API REST menciona 300 solicitudes/minuto/IP y caché de hasta 24 horas, pero se trata como una referencia separada, no como un contrato del MCP.

Guardrails propuestos hasta recibir confirmación de Upwork:

- sólo ejecución bajo demanda;
- máximo 2 páginas por búsqueda en la primera versión;
- máximo 10 resultados por página;
- una ejecución concurrente por fuente;
- timeout corto y backoff ante `429`/errores transitorios;
- no almacenar tokens en `params`, logs ni `rawPayload` de configuración;
- no persistir contenido de Upwork de forma duradera hasta resolver la política de retención.

### Cliente independiente dentro de Opportunity Hub

El backend no debe llamar a `codex mcp`, leer su almacén de tokens ni usar el `client_id`/callback de Codex. El diseño correcto es:

1. Registrar una aplicación propia con Upwork/MCP o usar un flujo autorizado de CIMD/DCR compatible con su metadata.
2. Ejecutar Authorization Code + PKCE desde una acción explícita del usuario.
3. Recibir el callback en Opportunity Hub y guardar sólo el refresh token de la aplicación, cifrado con una clave del entorno; el access token se mantiene efímero.
4. En cada ejecución, llamar al transporte MCP remoto oficial y permitir sólo `list_accounts`/`find_jobs`.
5. Validar esquema, límites, URLs y contenido no confiable antes de llamar a `ingestOpportunity`.
6. Registrar auditoría sin tokens, prompts privados, cookies ni datos personales innecesarios.

Hay un bloqueo de diseño importante: el pipeline actual conserva oportunidades indefinidamente, mientras que los términos API públicos limitan la copia/caché de contenido. Antes de persistir resultados de Upwork en las tablas existentes hay que confirmar si el uso privado de MCP permite esa retención o introducir una política de TTL/expiración específica. La PoC de este branch sólo mapea datos en memoria.

## 2. PoC de normalización

`src/server/connectors/upwork/mcp-mapper.ts` valida una fila de búsqueda MCP y la convierte al contrato `NormalizedOpportunity` sin tocar la base de datos.

Decisiones de seguridad:

- elimina sólo los marcadores de delimitación del contenido no confiable; no ejecuta HTML ni instrucciones;
- usa el ID y la URL de Upwork para la deduplicación existente;
- no inventa empresa, ubicación laboral, modalidad remota ni número de competidores a partir de datos ausentes;
- conserva importes, pero deja `budgetCurrency = null` cuando el MCP no devuelve moneda explícita; no hay conversión implícita;
- marca la confianza como `medium` porque una búsqueda puede traer sólo un snippet;
- reutiliza el scoring y Security Gate existentes una vez que el resultado pueda persistirse.

La fixture y las pruebas son sintéticas y no contienen el perfil ni resultados reales del usuario.

## 3. Playwright Browser Agent

Playwright sólo debe entrar en fuentes que autoricen automatización web. Upwork y Workana quedan fuera por ahora: para Upwork se usa el MCP oficial; para Workana no hay autorización de automatización.

### Contrato propuesto

`DiscoveryConnector` admite tres tipos: `official_api`, `mcp` y `browser`. Un conector de navegador debe declarar antes de ejecutarse:

- dominio y rutas permitidos;
- evidencia de autorización/terms revisados;
- acciones permitidas (`navigate`, `search`, `read`, `paginate`) y acciones prohibidas (`apply`, `message`, `upload`, `download`, `checkout`);
- límite de páginas, duración, tamaño de respuesta y número de resultados;
- si necesita sesión; si la necesita, el usuario la aporta explícitamente y nunca se exportan cookies al backend.

Flujo:

`SearchPlan` validado → navegador aislado y efímero → navegación a URLs allowlisted → snapshot accesible/DOM textual → extractor Zod → evidencia y URL → `NormalizedOpportunity` → Security Gate → pipeline existente.

El agente no debe ejecutar JavaScript arbitrario suministrado por una vacante, seguir instrucciones del contenido, descargar archivos, abrir repositorios ni hacer clic en CTAs externos. Un resultado ambiguo se devuelve como `needs_review`, no como un hecho.

Para la VM compartida, el navegador debe vivir en un proceso/servicio limitado y bajo demanda, con una sola sesión concurrente, sin scheduler, sin perfil persistente por defecto y con memoria/timeout acotados. La imagen de Playwright existente se usa para E2E; no se añade todavía `@playwright/mcp` al contenedor de producción.

Referencia técnica: [Playwright MCP oficial](https://github.com/microsoft/playwright-mcp). Su propio proyecto advierte que MCP no es una frontera de seguridad; la allowlist y los límites deben estar en Opportunity Hub.

## 4. Workana

No encontré una API/MCP público oficial documentado para buscar proyectos. Las alternativas autorizadas son:

1. conservar la importación manual actual;
2. usar las notificaciones oficiales de proyectos por email como entrada futura, sin convertir Gmail en la prioridad de M1;
3. pedir a Workana autorización/API/MCP por escrito antes de automatizar cualquier consulta;
4. seguir abriendo siempre el proyecto original para cualquier acción humana.

No se usarán endpoints internos, evasión de robots.txt o protecciones, scraping, crawlers, Playwright ni cookies de Workana. Las políticas oficiales también prohíben spam, contacto externo y compartir contenido de proyectos sin permiso: [políticas de Workana](https://help.workana.com/hc/en-us/articles/360040841214-Workana-Policies), [ayuda para encontrar trabajo](https://help.workana.com/hc/en-us/articles/360042088653-How-can-I-find-work).

## 5. Dashboard propuesto

La página `Sources` ya tiene estado, última ejecución, contadores e historial de `sync_runs`. Para discovery se propone una vista incremental, no un rediseño de arquitectura:

- tarjeta por fuente: `connected`, `pending_credentials`, `manual`, `error`, `disabled`;
- botón **Buscar ahora** sólo para conectores autorizados;
- formulario de búsqueda con consulta, modo, filtros, límite y opción de segunda página;
- banner visible de permisos: “sólo lectura; no postula, no envía mensajes, no gasta Connects”;
- historial de ejecuciones: fuente, trigger, filtros no sensibles, duración, resultados, nuevos/actualizados/omitidos, cursor y errores;
- lista de oportunidades descubiertas con badge de fuente, URL original, fecha, `applied`, propuestas como tier, score/confianza y riesgos;
- estado separado para “OAuth de la aplicación” y “Codex conectado”, porque una sesión de Codex nunca habilita el backend;
- acción explícita posterior **Importar al pipeline** mientras la retención de Upwork esté pendiente. No debe ocurrir implícitamente durante la búsqueda.

En la primera iteración se puede reutilizar `sync_runs` para ejecuciones read-only. No se añade una cola ni una tabla de descubrimientos hasta confirmar la política de retención y el flujo OAuth propio.

## 6. Implementación incremental

### M1.0 — PoC y decisión (esta rama)

- [x] validar OAuth y handshake desde Codex;
- [x] enumerar herramientas y confirmar que `find_jobs` es read-only;
- [x] ejecutar una búsqueda limitada de 3 resultados;
- [x] definir allowlist y contrato de conector;
- [x] mapear una respuesta sintética a `NormalizedOpportunity`;
- [x] documentar límites conocidos/desconocidos, Workana y Playwright;
- [ ] confirmar con Upwork la retención permitida para una CRM privada.

### M1.1 — Conector Upwork propio

- OAuth de Opportunity Hub, separado de Codex;
- token cifrado y callback local/privado aprobado;
- `list_accounts` + `find_jobs` únicamente;
- ejecución bajo demanda, cap de páginas y auditoría;
- prueba de integración con una respuesta real, sin escribir aún si la retención no está resuelta.

### M1.2 — Pipeline y dashboard

- importar sólo tras la decisión de retención;
- añadir `ingestionMethod = mcp` sólo con migración explícita;
- usar dedupe, scoring, elegibilidad y Security Gate existentes;
- historial y vista de candidatos; sin auto-aplicar ni auto-mensajear.

### M1.3 — Browser connectors autorizados

- registro por dominio con evidencia de autorización;
- Playwright aislado, límites fuertes y extractores específicos por fuente;
- primero un sitio de prueba o una fuente que autorice automatización;
- nunca usarlo para Workana/Upwork sin autorización escrita adicional.

## Decisiones que necesito antes de M1.1

1. ¿Aceptas tratar los resultados Upwork como efímeros (por ejemplo, TTL ≤ 24 h) hasta tener confirmación escrita de los términos MCP, o prefieres no persistir nada de Upwork?
2. ¿Autorizas crear el OAuth propio de Opportunity Hub con un callback local/privado, separado de Codex, cuando confirmemos el mecanismo de registro que acepta Upwork?
3. ¿Qué primera fuente web, aparte de Upwork/Workana, tiene autorización explícita para que diseñemos el primer conector Playwright?
