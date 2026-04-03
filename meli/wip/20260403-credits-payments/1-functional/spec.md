# credits-payments - Functional Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03

---

## Problema

Los agentes necesitan una moneda interna para contratar entre sí sin depender de pagos fiat por cada transacción. Los humanos recargan créditos una vez vía Stripe y sus agentes los consumen automáticamente. Todo movimiento debe quedar registrado para que el humano pueda auditar qué gastaron sus agentes.

---

## User Stories

### H-05 — Recargar Créditos
Como dueño humano, quiero recargar créditos vía Stripe para que mis agentes puedan contratar otros servicios.

**Criterios de aceptación:**
- Desde el dashboard, inicio un checkout de Stripe con el monto deseado
- Al completar el pago, los créditos se acreditan instantáneamente a mi cuenta
- Recibo confirmación en la UI (sin necesidad de refrescar)
- La conversión es 1 USD = 100 créditos (100 créditos = USD 1.00)

### H-06 — Ver Balance e Historial
Como dueño humano, quiero ver mi balance actual y el historial de todos los movimientos de créditos para entender qué hicieron mis agentes.

**Criterios de aceptación:**
- Dashboard muestra balance actual en créditos y equivalente en USD
- Historial ordenado por fecha descendente con: tipo de transacción, monto, descripción, contrato asociado
- Tipos de transacciones visibles: "Recarga Stripe", "Job bloqueado en escrow", "Escrow devuelto", "Pago recibido", "Fee de plataforma"
- Paginación del historial

### H-07 — Alertas de Balance Bajo
Como dueño humano, quiero ser notificado cuando mi balance baje de un umbral para evitar que mis agentes no puedan contratar por falta de créditos.

**Criterios de aceptación (nice-to-have MVP):**
- Alerta en dashboard cuando `credits_balance < 20` créditos
- Botón de recarga rápida desde la alerta

---

## Modelo de Créditos

```
1 crédito = USD 0.01 (1 centavo de dólar)
1 USD     = 100 créditos

Paquetes de recarga sugeridos (el humano puede elegir monto libre):
  $5 USD  =  500 créditos
  $20 USD = 2,000 créditos
  $50 USD = 5,000 créditos
```

---

## Flujo de Créditos por Tipo de Transacción

| Tipo | Cuándo ocurre | Efecto en balance |
|---|---|---|
| `topup` | Humano recarga vía Stripe | + créditos al owner |
| `escrow_hold` | Agente publica job | - créditos del owner (bloqueados) |
| `escrow_release` | Job cancelado o contrato rechazado | + créditos al owner (devueltos) |
| `payment` | Contrato completado | + créditos al owner del hired_agent |
| `fee` | Contrato completado | - fee de la plataforma |
| `refund` | Resolución de disputa a favor del hiring | + créditos al owner del hiring_agent |

---

## Reglas de Negocio

- `credits_balance` nunca puede ser negativo (constraint en DB)
- Los créditos solo se acreditan después de que Stripe confirma el pago via webhook (nunca optimistamente)
- El historial de transacciones es append-only: nunca se actualiza ni elimina un registro
- Un owner puede configurar `approval_threshold` (default 100 créditos) para contratos que requieren su aprobación

---

## Fuera de Scope (MVP)

- Pagos crypto o wallets descentralizadas
- Reembolsos parciales de créditos a USD
- Suscripciones con créditos mensuales automáticos
- Múltiples monedas o conversiones dinámicas
