# Fase 11 — Avisar al mesero, vencimiento automático, sin internet, KitchaGo y textos legales

Pedidos del usuario (2026-11-12):

1. **"Listo · avisar mesero" en cocina:** "estaría perfecto que se le avise al mesero". Cuando todos
   los platos de un pedido (en la vista de la estación) están listos, el pedido se queda en "En
   preparación" con el botón verde **"Listo · avisar mesero"**. Al tocarlo pasa a "Listos" y al
   mesero (y a la caja si es un pedido en línea) le llega un aviso con sonido: "Mesa 5: pedido
   listo para llevar". La hora del aviso es la que mide la espera en "Listos".
2. **Vencimiento del plan:** "pasa a vencido en un plazo de un día, con aviso anticipado de unos dos
   días". El dueño ve el aviso "por vencer" **2 días antes**. Al vencer queda **1 día de gracia**;
   después el restaurante se **suspende solo** (nadie entra y el menú no abre) hasta que el
   superadmin registre un pago, que lo reactiva. Una suspensión hecha a mano por el superadmin no
   se levanta sola con un pago.
3. **Sin internet** (puntos 13 y 15 del backlog):
   - **QR del Wi-Fi:** en Ajustes el dueño anota el nombre y la clave de su Wi-Fi; el PDF de QR de
     las mesas lleva, además del QR del menú, un QR para conectarse al Wi-Fi con un toque.
   - **Menú en PDF para imprimir** desde Panel → Menú, como respaldo (categorías, platos,
     descripción y precio; los agotados y ocultos no salen).
4. **Nombre del sistema: KitchaGo** (todavía sin dominio). Reemplaza "Menú QR" en lo que ve la gente.
5. **Borradores** de Términos y condiciones y de Política de privacidad (Ley 8968 de Costa Rica),
   con espacios para que el usuario llene sus datos. Deben revisarse con un abogado antes de
   publicarlos.

## Fuera de alcance

Cobro automático de la mensualidad, publicar las páginas legales en la web (después de que el
usuario complete y revise los textos), dominio y correo con el nombre nuevo (falta el dominio).

## Plan (sub-fases)

1. **11.1** Avisar al mesero desde cocina.
2. **11.2** Vencimiento automático del plan (2 días de aviso, 1 de gracia, suspensión y reactivación).
3. **11.3** QR del Wi-Fi y menú en PDF.
4. **11.4** Nombre KitchaGo.
5. **11.5** Borradores legales.
