# Documento Técnico — Máquina de estados de PuzzleCard

**Fecha:** 2026-08-01  
**Versión:** 1.0  
**Archivos afectados:** `src/hooks/usePuzzleSolverLocal.ts`, `src/components/feed/PuzzleCard.tsx`

---

## 1. Definición de estados

```typescript
// src/hooks/usePuzzleSolverLocal.ts:19
export type SolverStatus =
  | 'idle'       // Puzzle cargado; oponente aún no ha movido
  | 'playing'    // Turno del usuario — tablero interactivo
  | 'failed'     // El usuario hizo un movimiento incorrecto
  | 'reviewing'  // Modo revisión: navegando movimientos (N < total)
  | 'reviewed'   // Modo revisión: llegó al último movimiento
  | 'complete';  // Puzzle resuelto correctamente
```

---

## 2. Diagrama de transiciones

```
            ┌──────────────────────────────────────────────────────┐
            │         puzzle?.id cambia → reset a idle             │
            ▼                                                      │
         ┌──────┐                                                  │
         │ idle │ ──[auto: isActive=true, 500ms, oponente mueve]──▶│
         └──────┘                                                  │
                                                                   ▼
                                                            ┌─────────┐
                                                            │ playing │
                                                            └─────────┘
                                                               │      │
                                              movimiento       │      │ último movimiento
                                              incorrecto       │      │ correcto
                                                               ▼      ▼
                                                         ┌────────┐ ┌──────────┐
                                                         │ failed │ │ complete │──▶ siguiente puzzle
                                                         └────────┘ └──────────┘
                                                            │    │
                                               onRetry()   │    │ startReview()
                                                           ▼    ▼
                                                         idle  ┌───────────┐
                                                               │ reviewing │ ◀──────────────┐
                                                               └───────────┘                │
                                                                    │                       │
                                                 avanzar al         │      handleBackReview()
                                                 último movimiento  │                       │
                                                                    ▼                       │
                                                               ┌──────────┐                 │
                                                               │ reviewed │─────────────────┘
                                                               └──────────┘
                                                                    │
                                                          "Siguiente puzzle"
                                                                    ▼
                                                             siguiente puzzle
```

### Disparadores de transición

| Origen | Destino | Disparador | Código |
|--------|---------|------------|--------|
| `idle` | `playing` | Auto: `useEffect` + 500ms (oponente mueve) | `usePuzzleSolverLocal.ts:160` |
| `playing` | `failed` | `onUserMove` — movimiento incorrecto | `usePuzzleSolverLocal.ts:424` |
| `playing` | `complete` | `onUserMove` — último movimiento correcto | `usePuzzleSolverLocal.ts:435,448` |
| `failed` | `idle` | `onRetry()` | `usePuzzleSolverLocal.ts:541` |
| `failed` | `reviewing` | `startReview()` | `usePuzzleSolverLocal.ts:476` |
| `reviewing` | `reviewing` | `handleAdvanceReview()` (no último mov) o `handleBackReview()` | `usePuzzleSolverLocal.ts:502,529` |
| `reviewing` | `reviewed` | `handleAdvanceReview()` en el último movimiento | `usePuzzleSolverLocal.ts:502` |
| `reviewed` | `reviewing` | `handleBackReview()` | `usePuzzleSolverLocal.ts:529` |
| Cualquiera | `idle` | Cambio de puzzle (`puzzle?.id`) | `usePuzzleSolverLocal.ts:117` |

---

## 3. Botones por estado — estado actual vs. propuesta

### 3.1 `idle`

**Descripción:** El tablero acaba de cargar. Se está ejecutando la animación del movimiento del oponente (500ms).

| | Actual | Propuesta |
|---|---|---|
| Botones | Ninguno | Ninguno |
| Tablero | Deshabilitado | Deshabilitado |

**Justificación:** El usuario no tiene acción disponible. No se necesita ningún control.

---

### 3.2 `playing`

**Descripción:** Es el turno del usuario. El tablero está interactivo.

#### Estado actual
Ningún botón. Solo el tablero activo.

#### Propuesta: añadir "Ver solución"

| Botón | Estilo | Acción | Posición |
|-------|--------|--------|----------|
| Ver solución | Outline, tono neutro/suave | `startReview()` | Debajo del tablero |

**Justificación:** Sin este botón, un usuario que no sabe cómo proceder queda bloqueado indefinidamente. No hay salida excepto hacer swipe (que activa `forceFailure` vía LockedSlot) o hacer un movimiento incorrecto deliberadamente para entrar en `failed`.

**Riesgo:** El usuario puede usarlo como atajo para no pensar.  
**Mitigación propuesta:** Mostrar el botón con un delay de ~3 segundos después de entrar en `playing`, o con un estilo muy discreto (texto pequeño, baja opacidad). Alternativamente, añadir un `confirm()` modal: _"¿Seguro que quieres ver la solución? El puzzle se marcará como fallido."_

**Precondición para implementar:** `startReview()` ya llama `recordResult(..., false)` internamente (`usePuzzleSolverLocal.ts:460`), por lo que la penalización de ELO/FSRS ya está cubierta sin cambios al hook.

---

### 3.3 `failed`

**Descripción:** El usuario hizo un movimiento incorrecto. El tablero muestra borde rojo. `hasFailed = true`.

#### Estado actual

| Botón | Estilo | Acción |
|-------|--------|--------|
| Reintentar | Outline | `onRetry()` → `idle` |
| Ver solución | Accent (primario) | `startReview()` → `reviewing` |

#### Propuesta: añadir "Siguiente puzzle"

| Botón | Estilo | Acción | Posición |
|-------|--------|--------|----------|
| Reintentar | Outline | `onRetry()` → `idle` | Izquierda |
| Ver solución | Accent (primario) | `startReview()` → `reviewing` | Centro |
| Siguiente puzzle | Ghost / texto | `onComplete()` → siguiente | Derecha o debajo |

**Justificación:** Un usuario que falla y no quiere ni reintentar ni revisar la solución debe poder avanzar sin hacer swipe. El swipe en este contexto es ambiguo — no está diseñado como CTA de avance.

**Alternativa más conservadora:** Mantener dos botones pero invertir el énfasis: "Ver solución" como primario y "Reintentar" como secundario, y añadir "Siguiente" como enlace de texto pequeño debajo.

---

### 3.4 `reviewing`

**Descripción:** El usuario está navegando la solución. `reviewMoveIndex` va de 1 a `puzzle.moves.length - 1`.

#### Estado actual

| Control | Detalle |
|---------|---------|
| ‹ | `handleBackReview()`. Deshabilitado (opacity 0.25) cuando `reviewMoveIndex <= 0` |
| `N / M` | Contador de posición. `N = reviewMoveIndex`, `M = puzzle.moves.length` |
| › | `handleAdvanceReview()`. Deshabilitado cuando `reviewMoveIndex >= puzzle.moves.length` |
| Siguiente puzzle | Outline. `onComplete()` |

#### Propuesta: añadir notación UCI/SAN del movimiento actual

| Control | Detalle |
|---------|---------|
| ‹ | Sin cambio |
| `N / M  ·  Nf3` | Añadir notación del movimiento en posición `N` junto al contador |
| › | Sin cambio |
| Siguiente puzzle | Sin cambio |

**Justificación:** El contador `N / M` indica dónde estás pero no qué movimiento se está mostrando. Añadir la notación convierte la revisión en una herramienta de estudio real, no solo de reproducción.

**Implementación:** `puzzle.moves[reviewMoveIndex - 1]` es el UCI del movimiento que acaba de ejecutarse. Se puede mostrar directamente (formato UCI: `e2e4`, `g1f3`) o convertir a SAN con `chess.js` para mayor legibilidad.

**Alternativa mínima:** Solo mostrar el UCI sin conversión a SAN. Es técnico pero no requiere dependencia adicional ni carga de CPU.

---

### 3.5 `reviewed`

**Descripción:** El usuario llegó al último movimiento de la revisión. `reviewMoveIndex === puzzle.moves.length`.

#### Estado actual

| Control | Detalle |
|---------|---------|
| ‹ | `handleBackReview()`. Activo |
| `N / M` | Contador — `N === M` |
| › | `handleAdvanceReview()`. Deshabilitado (opacity 0.25) |
| Siguiente puzzle | **Outline** (mismo estilo que en `reviewing`) |

#### Propuesta: promover "Siguiente puzzle" a botón primario

| Control | Detalle |
|---------|---------|
| ‹ | Sin cambio |
| `N / M` | Sin cambio |
| › | Sin cambio (deshabilitado) |
| Siguiente puzzle | **Primario** (accent o success, igual que en `complete`) |

**Justificación:** El usuario completó la revisión — el CTA de salida debe ser igual de prominente que en `complete`. El outline actual lo hace visualmente secundario, lo que puede crear confusión sobre si hay algo más que hacer.

**Cambio de código mínimo:** En `PuzzleCard.tsx:204-213`, añadir lógica condicional al estilo del botón dependiendo de si `puzzleStatus === 'reviewed'`.

---

### 3.6 `complete`

**Descripción:** El puzzle fue resuelto correctamente. Se muestra badge de ELO `+N`.

#### Estado actual

| Botón | Estilo | Plataforma | Acción |
|-------|--------|-----------|--------|
| Compartir | Outline | Solo native | `captureAndShare()` |
| Siguiente puzzle | Success (verde, primario) | Todas | `onComplete()` |

#### Propuesta: añadir "Revisar"

| Botón | Estilo | Plataforma | Acción |
|-------|--------|-----------|--------|
| Revisar | Outline | Todas | `startReview()` → `reviewing` |
| Compartir | Outline | Solo native | `captureAndShare()` |
| Siguiente puzzle | Success (verde, primario) | Todas | `onComplete()` |

**Justificación:** Actualmente no hay forma de ver cómo resolviste el puzzle después de completarlo. Revisar la línea ganadora tiene alto valor pedagógico, especialmente en puzzles largos o con variantes elegantes.

**Precondición:** `startReview()` desde `complete` funciona correctamente — llama `recordResult(..., false)` pero `countedRef` ya tiene el `puzzleId` sellado (`usePuzzleSolverLocal.ts:204`), por lo que la llamada es no-op. El tablero se resetea a la posición inicial y permite navegar la solución completa. **No requiere cambios al hook.**

**Consideración de web:** En web no hay `captureAndShare`. Opciones para compartir en web:
- Web Share API (`navigator.share`) con fallback a clipboard
- Solo clipboard con toast de confirmación

---

## 4. Tabla resumen consolidada

| Estado | Botón 1 | Botón 2 | Botón 3 | Tablero |
|--------|---------|---------|---------|---------|
| `idle` | — | — | — | Deshabilitado |
| `playing` | _(Ver solución — ghost, delay 3s)_ | — | — | **Activo** |
| `failed` | Reintentar (outline) | Ver solución (accent) | _(Siguiente — ghost)_ | Deshabilitado |
| `reviewing` | ‹ navegar (outline) | `N/M · UCI` (label) | › navegar (outline) | Deshabilitado |
| `reviewing` | — | Siguiente puzzle (outline) | — | — |
| `reviewed` | ‹ navegar (outline) | `N/M · UCI` (label) | › (disabled) | Deshabilitado |
| `reviewed` | — | **Siguiente puzzle (primario)** | — | — |
| `complete` | _(Revisar — outline)_ | Compartir (outline, native) | Siguiente (success) | Deshabilitado |

_Cursiva = nuevo. Negrita = cambio de énfasis._

---

## 5. Claves i18n necesarias

Los siguientes keys son nuevos y deben añadirse a `src/i18n/locales/{es,en,fr,pt}.json`:

| Key | ES | EN | FR | PT |
|-----|----|----|----|-----|
| `puzzle.nextPuzzleSkip` | Siguiente | Skip | Passer | Próximo |
| `puzzle.reviewSolution` | Revisar | Review | Réviser | Revisar |
| `puzzle.viewSolutionConfirm` | ¿Ver la solución? El puzzle se marcará como fallido. | View solution? The puzzle will be marked as failed. | Voir la solution ? Le puzzle sera marqué comme échoué. | Ver solução? O puzzle será marcado como falhado. |

> `puzzle.viewSolution` ya existe — es el botón en `failed`. `puzzle.reviewSolution` es el nuevo botón en `complete`.

---

## 6. Prioridad de implementación

| Cambio | Impacto UX | Complejidad | Prioridad |
|--------|-----------|-------------|-----------|
| `reviewed` → botón primario | Alto — reduce confusión de salida | Mínima (cambio de estilo) | P0 |
| `failed` → añadir "Siguiente" | Medio — elimina dead-end | Baja | P1 |
| `complete` → añadir "Revisar" | Medio — valor pedagógico | Baja (hook ya lo soporta) | P1 |
| `playing` → añadir "Ver solución" | Alto — elimina bloqueo total | Media (requiere delay/confirm) | P2 |
| `reviewing` → notación de movimiento | Bajo — mejora de estudio | Media (conversión UCI→SAN) | P3 |
| Web share en `complete` | Bajo — paridad de plataforma | Media (Web Share API) | P3 |
