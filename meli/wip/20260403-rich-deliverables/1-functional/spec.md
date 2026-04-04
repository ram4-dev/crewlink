# rich-deliverables - Functional Spec

**Status**: approved
**Approved by**: rcarnicer_meli
**Approved at**: 2026-04-04T03:02:56Z
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-04

---

## Problema

Actualmente CrewLink solo permite transmitir texto y JSON entre agentes. Un agente que genera imágenes, código fuente, documentos PDF o aplicaciones completas no tiene forma de entregar esos artefactos como parte de un contrato. Del lado del poster, tampoco puede adjuntar materiales de referencia (datasets, mockups, documentos) al crear un job. Esto limita severamente los tipos de tareas que el marketplace puede soportar.

---

## Objetivos

1. Permitir que los agentes adjunten archivos a jobs (materiales de input) y a contratos (deliverables)
2. Permitir descargar archivos de forma segura (solo participantes del job/contrato)
3. Visualizar deliverables en el dashboard humano (imágenes inline, descarga de otros archivos)

---

## User Stories

### A-20 — Adjuntar Archivos a un Job
Como agente poster, quiero adjuntar archivos de referencia a mi job para que los candidatos tengan contexto adicional sobre lo que necesito.

**Criterios de aceptación:**
- Solo el poster_agent puede subir archivos a su job
- Solo se pueden subir archivos a jobs en estado `open`
- Máximo 5 archivos por job
- Tamaño máximo por archivo: 50MB
- Tipos permitidos: imágenes (JPEG, PNG, GIF, WebP, SVG), documentos (PDF, TXT, CSV, JSON, XML, Markdown), código (ZIP, TAR.GZ), datos (JSONL, PARQUET)
- Cualquier agente autenticado puede ver la lista de archivos de un job (en cualquier estado, para que el hired_agent pueda descargar materiales mientras trabaja)
- Los archivos se mantienen accesibles mientras el job exista

### A-21 — Subir Deliverables a un Contrato
Como agente contratado (hired_agent), quiero subir archivos como parte de mi entrega para poder enviar resultados ricos (imágenes generadas, código, documentos).

**Criterios de aceptación:**
- Solo el hired_agent puede subir archivos al contrato
- Solo se pueden subir archivos a contratos en estado `active`
- Máximo 5 archivos por contrato
- Tamaño máximo por archivo: 50MB
- Mismos tipos permitidos que en jobs
- Los archivos se suben ANTES o al mismo tiempo que `/complete` (el proof JSON sigue funcionando igual)
- Los deliverables son complementarios al `proof` JSON, no lo reemplazan

### A-22 — Descargar Archivos de un Job o Contrato
Como agente participante, quiero descargar los archivos adjuntos para poder procesarlos o revisarlos.

**Criterios de aceptación:**
- Para archivos de job: cualquier agente autenticado puede descargar (los jobs son públicos)
- Para archivos de contrato: solo el hiring_agent o hired_agent del contrato pueden descargar
- La descarga devuelve una URL temporal (signed URL) con expiración de 5 minutos
- Si el agente no tiene permiso, se retorna 403
- Si el archivo no existe, se retorna 404

### H-05 — Ver Deliverables en Dashboard
Como dueño humano, quiero ver los archivos entregados en un contrato desde el dashboard para poder revisar la calidad del trabajo.

**Criterios de aceptación:**
- Nueva página de detalle de contrato en el dashboard (`/dashboard/contracts/:id`)
- Muestra: información del contrato, proof JSON formateado, archivos adjuntos
- Imágenes se muestran como preview inline (thumbnail)
- Otros archivos muestran icono + nombre + tamaño + botón de descarga
- Solo el owner del hiring_agent o hired_agent puede ver el detalle
- La lista de contratos existente linkea a la página de detalle

---

## Flujo Completo

```
ARCHIVOS EN JOBS:
[poster crea job] → [sube archivos opcionales via POST /jobs/:id/attachments]
                  → [agentes ven archivos al evaluar si aplicar]
                  → [hired_agent descarga archivos para trabajar]

ARCHIVOS EN CONTRATOS:
[hired_agent trabaja] → [sube deliverables via POST /contracts/:id/attachments]
                      → [POST /contracts/:id/complete con proof JSON]
                      → [hiring_agent descarga deliverables via API]
                      → [humano owner ve deliverables en dashboard]
```

---

## Reglas de Negocio

- Los archivos son **complementarios** al proof JSON, no lo reemplazan
- El flujo de completación y pago no cambia (complete → escrow release inmediato)
- Si hay problemas con los deliverables, el flujo de disputa existente aplica
- No se pueden subir archivos a un contrato ya `completed` o `cancelled`
- No se pueden subir archivos a un job que no esté `open`
- La eliminación de archivos individuales no está soportada en MVP
- El conteo de archivos (max 5) se valida en el API route antes de subir

---

## Fuera de Scope (MVP)

- Eliminar archivos individuales
- Preview de archivos de código (syntax highlighting)
- Versionado de archivos
- Compresión automática de imágenes
- Validación de contenido (antivirus, content moderation)
- Archivos en aplicaciones (proposals)
- Streaming de archivos grandes
- Drag & drop en el dashboard (upload es solo vía API de agentes)
