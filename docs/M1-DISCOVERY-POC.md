# M1.0 — descubrimiento autónomo: Upwork MCP read-only

Fecha del estudio: 2026-10-14
Rama: `m1/discovery-poc`
Estado: **implementación lista para revisión; OAuth real deliberadamente detenido antes de abrir el navegador**

## Decisión de alcance

M1 empieza por descubrir oportunidades, no por Gmail. La primera versión debe poder ejecutar una búsqueda bajo demanda mediante conectores autorizados, convertir resultados a `NormalizedOpportunity` y reutilizar el pipeline existente de deduplicación, scoring y Security Gate.

Esta rama añade el cliente OAuth/MCP propio, el flujo manual de Sources y la integración read-only con el pipeline. No añade workers, búsquedas programadas ni navegación contra plataformas de trabajo. La conexión real de Upwork se probó desde Codex sólo para validar viabilidad y catálogo de herramientas; Opportunity Hub no reutiliza ese token, sesión ni callback.

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

Guardrails implementados mientras se valida el flujo real:

- sólo ejecución bajo demanda;
- máximo 1 página por búsqueda en la primera versión;
- máximo 10 resultados por página;
- una ejecución concurrente por fuente;
- timeout corto y backoff ante `429`/errores transitorios;
- no almacenar tokens en `params`, logs ni `rawPayload` de configuración;
- TTL conservador de 23 h para contenido MCP, sin `rawPayload`, y purga al cargar el área privada;
- revocación remota best-effort y borrado local de tokens y resultados temporales al desconectar;
- ningún scheduler de búsquedas.

### Cliente independiente dentro de Opportunity Hub

El backend no debe llamar a `codex mcp`, leer su almacén de tokens ni usar el `client_id`/callback de Codex. El diseño correcto es:

1. Registrar una aplicación propia con Upwork/MCP o usar un flujo autorizado de CIMD/DCR compatible con su metadata.
2. Ejecutar Authorization Code + PKCE desde una acción explícita del usuario.
3. Recibir el callback en Opportunity Hub y guardar access/refresh tokens de la aplicación cifrados con AES-256-GCM y una clave dedicada del entorno; nunca se guardan en el repositorio, logs, parámetros de búsqueda ni se mezclan con Codex.
4. En cada ejecución, llamar al transporte MCP remoto oficial y permitir sólo `list_accounts`/`find_jobs`.
5. Validar esquema, límites, URLs y contenido no confiable antes de llamar a `ingestOpportunity`.
6. Registrar auditoría sin tokens, prompts privados, cookies ni `rawPayload`.

Los términos públicos de Upwork permiten copias intermedias limitadas y caché por no más de 24 horas; también exigen borrado ante solicitud del usuario, desactivación/desinstalación/cierre de la aplicación y terminación de los términos. El MCP oficial remite a esos términos, pero no publica un límite MCP distinto. Por seguridad de cumplimiento, la implementación usa 23 horas, redacta contenido al vencer y no hace polling. Al desconectar, revoca el token cuando es posible, elimina los tokens locales y redacta los resultados MCP temporales. Se conservan sólo el registro mínimo del CRM y las anotaciones propias del usuario.

Fuentes: [Upwork API & MCP Terms](https://www.upwork.com/legal), [ayuda oficial de MCP](https://support.upwork.com/hc/en-us/articles/55446516654611-How-to-use-Upwork-with-AI-agents-through-MCP).

La implementación está en `src/server/connectors/upwork/`: OAuth con `state` cifrado, PKCE `S256`, callback exacto, refresh/revocación, cliente Streamable HTTP y allowlist de dos herramientas. La UI prepara la autorización y muestra dominio, callback y permisos antes de revelar el enlace; no se ha abierto el navegador desde Opportunity Hub.

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

## 5. Dashboard y ejecución manual

La página `Sources` ya tiene estado, última ejecución, contadores e historial de `sync_runs`. Para discovery se propone una vista incremental, no un rediseño de arquitectura:

- tarjeta por fuente: `connected`, `pending_credentials`, `manual`, `error`, `disabled`;
- botón **Connect Upwork** que primero muestra dominio, callback, scope y allowlist;
- acción **Buscar Jobs** sólo después de una conexión propia autorizada;
- formulario de búsqueda con consulta, modo, filtros y límite de 10 resultados;
- banner visible de permisos: “sólo lectura; no postula, no envía mensajes, no gasta Connects”;
- historial de ejecuciones: fuente, trigger, filtros no sensibles, duración, resultados, nuevos/actualizados/omitidos y errores;
- oportunidades entran al pipeline existente con badge de fuente, dedupe, score/confianza y riesgos;
- estado separado para “OAuth de la aplicación” y “Codex conectado”, porque una sesión de Codex nunca habilita el backend;
- acción **Desconectar y borrar datos temporales**, con revocación remota best-effort.

La primera iteración reutiliza `sync_runs` para ejecuciones read-only. No se añade una cola ni una tabla de descubrimientos y no hay búsquedas programadas.

## 6. Implementación incremental

### M1.0 — cliente propio y discovery manual (esta rama)

- [x] validar OAuth y handshake desde Codex;
- [x] enumerar herramientas y confirmar que `find_jobs` es read-only;
- [x] ejecutar una búsqueda limitada de 3 resultados;
- [x] definir allowlist y contrato de conector;
- [x] mapear una respuesta sintética a `NormalizedOpportunity`;
- [x] documentar límites conocidos/desconocidos, Workana y Playwright;
- [x] implementar OAuth propio, cifrado, refresh/revocación, allowlist y rate limit;
- [x] integrar Sources, historial y pipeline existente con TTL compatible;
- [x] añadir tests sintéticos de PKCE/state/cifrado/transporte/parsing;
- [ ] ejecutar la autorización OAuth real, pendiente de revisión explícita del usuario.

### M1.1 — validación real posterior a la revisión

- registrar la aplicación propia en Upwork y confirmar el callback exacto;
- revisar la pantalla de permisos antes de autorizar;
- ejecutar una búsqueda real manual de baja frecuencia y verificar expiración/revocación;
- confirmar cualquier cambio que Upwork exija en términos, scopes o límites.

### M1.2 — conectores web autorizados y dashboard ampliado

- diseñar Playwright sólo para dominios con autorización explícita;
- ampliar historial/estado específico sólo si el flujo manual demuestra utilidad;
- mantener dedupe, scoring, elegibilidad y Security Gate existentes;
- sin auto-aplicar ni auto-mensajear.

### M1.3 — Browser connectors autorizados

- registro por dominio con evidencia de autorización;
- Playwright aislado, límites fuertes y extractores específicos por fuente;
- primero un sitio de prueba o una fuente que autorice automatización;
- nunca usarlo para Workana/Upwork sin autorización escrita adicional.

## Siguiente confirmación necesaria

1. Revisa en Sources el dominio `https://www.upwork.com`, el callback exacto configurado y la allowlist `list_accounts, find_jobs`.
2. Confirma explícitamente antes de abrir el enlace de autorización. Hasta entonces no se ejecuta OAuth real.
3. Después de validar una búsqueda manual real, decidimos juntos si se inicia el siguiente conector autorizado; Gmail sigue diferido.
