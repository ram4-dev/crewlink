# Spec de Remediación 02

## Security Hardening

Fecha: 2026-04-03
Prioridad: P0
Ámbito: `auth-identity`, `security`, `agent-registry`, onboarding Clerk

---

## Problema

La implementación actual tiene gaps de seguridad en cuatro zonas:

1. registro de agentes sin validación SSRF obligatoria;
2. entrega de Owner API Key durante onboarding con aislamiento insuficiente;
3. rate limiting y lockout degradados de forma insegura;
4. validación incompleta de manifests y schemas.

---

## Decisiones

### D1. SSRF validation es obligatoria en create y update

Todo alta o modificación de `endpoint_url` debe pasar por la misma validación SSRF.

No se admite registrar manifests si:

- apuntan a dominios de CrewLink;
- resuelven a IP privada;
- resuelven a metadata endpoints;
- usan HTTP fuera de desarrollo.

### D2. La validación DNS debe revisar todas las resoluciones

El control SSRF no puede depender de una sola respuesta de `dns.lookup()`.

La implementación debe:

- resolver todas las IPv4 e IPv6 disponibles;
- bloquear si cualquiera cae en rangos privados o reservados;
- tratar errores de resolución como rechazo del registro.

### D3. Owner API Key nunca se difunde por canal compartido

Queda prohibido entregar la API key en texto plano a través de:

- un canal Realtime global,
- broadcasts reutilizables,
- payloads no vinculados criptográficamente al usuario autenticado.

Alternativas válidas:

1. mostrar la key solo en el response síncrono de una acción autenticada del dashboard;
2. guardar un secreto efímero cifrado/one-time retrieval asociado al `users.id`;
3. usar un canal efímero por usuario con autorización estricta basada en RLS o token firmado.

La opción recomendada para MVP es:

- eliminar entrega por webhook;
- generar la primera API key desde una acción autenticada del dashboard al detectar onboarding pendiente.

### D4. Fallback de seguridad debe fail closed o fail reduced-risk

Si Upstash no está configurado:

- auth lockout debe seguir activo con fallback in-memory;
- rate limit no puede quedar “allow all” en endpoints sensibles.

MVP aceptable:

- fallback in-memory para `auth`, `api`, `search` con límites equivalentes y warning estructurado en logs.

Si no se implementa fallback:

- el arranque en producción debe fallar cuando falten las env vars de seguridad obligatorias.

### D5. Manifest validation debe validar Draft 7 real

Además de tamaño y profundidad, se debe validar que:

- `input_schema` sea un JSON Schema válido;
- `output_schema` sea un JSON Schema válido.

Si Ajv no compila el schema, el manifest se rechaza.

---

## Reglas obligatorias

### R1. Registro de agentes

`POST /api/agents/register` debe ejecutar:

1. auth de Owner API Key;
2. validación estructural del manifest;
3. validación JSON Schema;
4. validación SSRF del `endpoint_url`;
5. creación de agente y manifest.

No se admite persistir el agente y luego descubrir que el endpoint era inválido.

### R2. Actualización de manifests

`PUT /api/agents/me/manifests/:id` debe ejecutar la misma cadena de validaciones.

Si el endpoint no cambió, el sistema puede saltear la resolución DNS, pero no las demás validaciones del manifest.

### R3. Delivery de API key

La primera API key del owner debe seguir una política one-time:

- visible una sola vez;
- vinculada al usuario correcto;
- no recuperable en texto plano luego de la emisión;
- no distribuida por broadcast global.

### R4. Logs

Nunca loggear:

- Owner API Key completa;
- agent secret;
- JWT completo.

Solo se admite:

- máscara irreversible o últimos 4 chars del secreto original cuando sea estrictamente necesario.

---

## Variables de entorno

Se unifican nombres obligatorios:

- `MAX_AGENT_CHAIN_DEPTH`
- `FEATURE_FLAG_SEMANTIC_SEARCH`

Se deprecian:

- `MAX_DEPTH_LEVEL`
- `SEMANTIC_SEARCH_ENABLED`

Puede existir compatibilidad transitoria por una release, pero:

- el código debe loggear warning de deprecación;
- `.env.example` debe reflejar ya los nombres canónicos;
- los specs activos deben usar solo los nombres canónicos.

---

## Testing obligatorio

Mínimos de integración/unit:

- register rechaza `endpoint_url` privado;
- register rechaza `endpoint_url` metadata;
- register rechaza `endpoint_url` CrewLink;
- update rechaza los mismos casos;
- manifest inválido por schema Draft 7 => `400`;
- onboarding no expone API key a otro usuario;
- auth rate limit sigue operativo sin Upstash o el arranque falla explícitamente;
- lockout sigue operativo sin Upstash;
- logs no contienen secretos completos.

---

## Definition of Done

- no existe camino de alta/update de manifest sin SSRF validation;
- la validación DNS revisa todas las IPs resueltas;
- onboarding deja de difundir API keys por broadcast global;
- manifests inválidos por JSON Schema real se rechazan;
- rate limiting/lockout no quedan desactivados silenciosamente en producción;
- env vars y specs activas usan los mismos nombres canónicos.
