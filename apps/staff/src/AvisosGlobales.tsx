import { useAuth } from './auth';
import { avisar } from './avisos';
import { useTiempoReal } from './tiempoReal';

type ConMesa = { lugar: string }; // "Mesa 3" o "Para llevar #12 · Ana"

// Escucha los eventos que merecen aviso para el rol de la sesión, en cualquier pantalla. Las
// pantallas siguen escuchando por su cuenta solo para refrescar sus datos (sin sonar).
function Oyente({ rol, id }: { rol: string; id: string }) {
  const sala = rol === 'DUENO' || rol === 'MESERO';
  const caja = rol === 'DUENO' || rol === 'CAJA';
  useTiempoReal(
    {
      ...(sala && {
        'mesa:llamada': (p: ConMesa & { tipo: string }) =>
          avisar('llamada', `${p.lugar} llama al mesero`, 3),
        'pedido:nuevo': (p: ConMesa) => avisar('pedido', `${p.lugar}: pedido nuevo por confirmar`),
      }),
      ...((sala || caja) && {
        'cuenta:solicitada': (p: ConMesa) => avisar('cuenta', `${p.lugar} pidió la cuenta`),
        'enlinea:nuevo': (p: ConMesa) => avisar('pedido', `Pedido en línea nuevo: ${p.lugar}`, 3),
      }),
      // El dueño ya recibe los pedidos nuevos; a cocina le avisa cuando entran a preparar.
      ...(rol === 'COCINA' && {
        'pedido:confirmado': (p: ConMesa) =>
          avisar('cocina', `${p.lugar}: pedido nuevo para cocina`, 3),
      }),
      // Al repartidor, solo las entregas que le asignan a él.
      ...(rol === 'REPARTIDOR' && {
        'reparto:asignado': (p: ConMesa & { repartidorId: string }) =>
          p.repartidorId === id && avisar('reparto', `Nueva entrega: ${p.lugar}`, 3),
      }),
    },
    () => {},
  );
  return null;
}

export function AvisosGlobales() {
  const { usuario } = useAuth();
  if (!usuario || usuario.rol === 'SUPERADMIN' || usuario.debeCambiarPassword) return null;
  // key: si cambia la sesión, el socket se vuelve a abrir con el token nuevo.
  return <Oyente key={usuario.id} rol={usuario.rol} id={usuario.id} />;
}
