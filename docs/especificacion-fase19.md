# Fase 19 — Rediseño de la mesa del mesero

Pedido del usuario (2026-11-23), tras probar el mesero: "el mesero toca una mesa y le parece una
lista poco intuitiva". Aprobó la propuesta: "sigue con el rediseño".

También aclaró que el pedido del cliente debe llegar listo para que el mesero solo lo acepte y lo
envíe: eso ya existe ("Confirmar y enviar a cocina" en Pendientes) y ahora también sale dentro de
la mesa. "Tomar pedido" queda para el cliente sin celular o sin internet.

## 19.1 Detalle de la mesa ✅

Antes: una lista plana de platos (repetidos en renglones separados), con el estado en letra
pequeña y un "Cancelar" rojo en cada renglón.

Ahora, al tocar una mesa:

- **Encabezado:** "Mesa N", cuántas personas y, si aplica, **"Pidió la cuenta"**.
- **Por grupos, en el orden en que el mesero actúa** (solo se muestran los que tienen algo):
  1. **Por confirmar** — pedidos que hizo el cliente desde su celular, con el botón grande
     **"Confirmar y enviar a cocina"** (y "Cancelar pedido").
  2. **Listo para servir** — resaltado, con un botón **"Servido"** por plato.
  3. **En cocina** — dice si ya lo están preparando o si está en espera.
  4. **Ya servido** — atenuado.
  5. **Cancelados** — escondidos en un desplegable.
- **Platos iguales juntos:** "2× Gallo pinto con huevo" en vez de dos renglones (mismo plato,
  mismos extras y misma nota). Los extras y la nota se ven debajo del nombre.
- **"Cancelar" escondido** en el menú "⋯" de cada plato de "En cocina" (pide el motivo).
- **Abajo:** total de la cuenta (si ya hay algo confirmado) y **"Tomar pedido"**, con la aclaración "para clientes sin
  celular".
- Sin internet: "Servido" y "Confirmar" se guardan en el equipo (Fase 18) y la mesa se ve con el
  cambio hecho; cancelar necesita internet.

## Fuera de alcance

Cambiar el modelo de estados, cobrar desde el mesero, mover platos entre mesas.
