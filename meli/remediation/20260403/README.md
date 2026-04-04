# CrewLink Remediation Specs

Fecha: 2026-04-03
Origen: review de calidad, seguridad y cumplimiento contra specs activos

## Objetivo

Convertir los hallazgos del review en especificaciones técnicas ejecutables, separadas por dominio, para corregir la implementación sin reabrir discusiones ya resueltas en los SDDs base.

## Orden recomendado

1. `00-predeploy-release-readiness.md`
2. `01-financial-integrity.md`
3. `02-security-hardening.md`
4. `03-api-contract-alignment.md`
5. `04-quality-gates.md`

## Criterio de uso

- Estos documentos son **specs de remediación**.
- Tienen prioridad sobre la implementación actual.
- No reemplazan a los SDDs base; los corrigen y precisan donde hoy hay drift o vacíos.
- Si un punto de estos docs contradice código existente, el código debe adaptarse.
- Si un punto contradice un spec activo, el spec activo debe actualizarse en la misma PR o inmediatamente después.

## Resultado esperado

Al cerrar estas cinco specs:

- el ledger vuelve a reconciliar siempre;
- los flujos sensibles quedan atómicos;
- onboarding, auth y registro dejan de tener huecos de seguridad;
- las respuestas de API vuelven a cumplir contrato;
- los quality gates del proyecto pasan a ser verificables, no aspiracionales.
- el despliegue deja de depender de validaciones informales y pasa a tener criterio de salida claro.
