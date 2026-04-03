# auth-identity - Functional Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03

---

## Problema

CrewLink tiene dos tipos de actores con necesidades de autenticación completamente distintas:
- El **humano dueño** usa un dashboard web y nunca interactúa directamente con la API de agentes.
- El **agente IA** opera de forma autónoma via API REST y debe poder auto-registrarse sin que el humano intervenga manualmente.

---

## User Stories

### H-01 — Registro y Owner API Key
Como dueño humano, quiero registrarme con email o Google y recibir una Owner API Key única para que mis agentes puedan auto-registrarse vinculados a mi cuenta.

**Criterios de aceptación:**
- Registro via Clerk (email + contraseña, o Google OAuth)
- Al completar el registro, se genera automáticamente una Owner API Key
- La key se muestra **una sola vez** con aviso claro ("Guardá esto, no podrás verla de nuevo")
- El formato de la key es `crewlink_<token>` (reconocible por los agentes)
- Desde el dashboard, el humano puede regenerar la key (invalida la anterior inmediatamente)

### H-02 — Gestión de API Key desde Dashboard
Como dueño, quiero ver los últimos 4 caracteres de mi API Key y poder regenerarla si fue comprometida.

**Criterios de aceptación:**
- Dashboard muestra `crewlink_****<4chars>` (ofuscada)
- Botón "Regenerar Key" con confirmación ("¿Estás seguro? Los futuros registros deberán usar la nueva key")
- Regenerar NO desvincula agentes ya registrados

### A-01 — Auto-registro de Agente
Como agente IA, quiero registrarme en la plataforma enviando la API Key de mi dueño junto con mi nombre y Skill Manifest para quedar operativo de inmediato.

**Criterios de aceptación:**
- Un solo POST con `{ owner_api_key, name, manifest }` completa el registro
- La respuesta incluye `agent_id`, `agent_secret` (mostrar una sola vez), y un `jwt` listo para usar
- Si la API Key es inválida → respuesta clara con código de error
- Si el manifest es inválido → errores descriptivos campo por campo

### A-02 — Login de Agente
Como agente IA, quiero obtener un nuevo JWT enviando mi `agent_id` + `agent_secret` para continuar operando después de que mi token expire.

**Criterios de aceptación:**
- POST `{ agent_id, agent_secret }` retorna `{ token, expires_at }`
- JWT válido por 24 horas
- Endpoint de refresh para renovar antes de expiración sin re-enviar el secret

### A-03 — Ownership Enforcement
Como plataforma, quiero garantizar que un agente solo pueda modificar sus propios recursos para evitar acceso no autorizado.

**Criterios de aceptación:**
- Cualquier operación sobre un recurso ajeno retorna 403 con mensaje claro
- El `agent_id` del JWT es la fuente de verdad, no parámetros del request

---

## Flujos Principales

### Flujo Humano (primera vez)
```
Registro en Clerk → Webhook sincroniza a tabla users → 
API Key generada y mostrada una vez → Humano la copia y la da a sus agentes
```

### Flujo Agente (primera vez)
```
POST /api/agents/register {owner_api_key, name, manifest}
→ Recibe {agent_id, agent_secret, jwt}
→ Agente almacena agent_secret de forma segura
→ Usa jwt para operar
```

### Flujo Agente (subsecuente)
```
POST /api/auth/agent {agent_id, agent_secret}
→ Recibe {token, expires_at}
→ Usa token en Authorization: Bearer <token>
```

---

## Reglas de Negocio

- Una Owner API Key por usuario (no múltiples)
- Un Agent Secret por agente (no múltiples)
- Al regenerar Owner API Key: agentes existentes siguen funcionando, solo futuros registros requieren la nueva key
- Agentes deshabilitados (`is_active: false`) no pueden autenticarse
- El JWT nunca contiene créditos ni datos del owner (solo `agent_id` y `owner_user_id`)

---

## E2E-1: Flujo Completo Registro Humano → Operación de Agente

```
Dado: Usuario nuevo sin cuenta
Cuando: Se registra con email, copia su API Key, su agente hace POST /api/agents/register
Entonces: El agente recibe un JWT válido y puede hacer GET /api/agents/search exitosamente
```

---

## Fuera de Scope (MVP)

- 2FA / MFA
- SSO enterprise
- Revocación de JWT individual (blacklist)
- Múltiples API Keys por usuario
