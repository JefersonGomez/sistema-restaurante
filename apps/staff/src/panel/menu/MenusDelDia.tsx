import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Moneda } from '@menu-qr/shared';
import { formatoPrecio } from '@menu-qr/ui';
import { api } from '../../api';
import { Etiqueta, Tarjeta } from '../comunes';

type Plato = {
  id: string;
  nombreEs: string;
  precio: number;
  activo: boolean;
  categoriaId: string;
  menuDelDia: boolean;
  diasSemana: number[];
  fechaMenu: string | null;
};
const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

const cuando = (p: Plato) => {
  const dias = ORDEN.filter((d) => p.diasSemana.includes(d)).map((d) => NOMBRE_DIA[d]);
  const fecha = p.fechaMenu
    ? new Date(`${p.fechaMenu.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CR', {
        day: 'numeric',
        month: 'short',
      })
    : null;
  if (dias.length === 7) return 'Todos los días';
  return [dias.join(', '), fecha && `el ${fecha}`].filter(Boolean).join(' y ') || 'Sin programar';
};
const esHoy = (p: Plato) =>
  p.diasSemana.includes(new Date().getDay()) ||
  p.fechaMenu?.slice(0, 10) === new Intl.DateTimeFormat('en-CA').format(new Date());

// Menús del día (combos): se programan por día de la semana o para una fecha; el cliente los ve
// en su propia sección del menú.
export function MenusDelDia({ categoriaId }: { categoriaId: string | undefined }) {
  const platos = useQuery({ queryKey: ['platos'], queryFn: () => api<Plato[]>('/platos') });
  const config = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<{ moneda: Moneda }>('/restaurante'),
  });
  const menus = (platos.data ?? []).filter((p) => p.menuDelDia);
  const precio = formatoPrecio(config.data?.moneda ?? 'CRC');
  return (
    <Tarjeta className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-purple-soft text-purple">
          <CalendarDays className="size-5" aria-hidden />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="font-semibold">Menús del día</p>
          <p className="text-sm text-muted">
            Combos con precio fijo (p. ej. sopa + casado + fresco). El cliente los ve arriba del
            menú el día que toca.
          </p>
        </div>
        {categoriaId && (
          <Link
            to={`/panel/menu/plato/nuevo?menuDelDia=1&categoria=${categoriaId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent"
          >
            <Plus className="size-4" aria-hidden /> Agregar menú del día
          </Link>
        )}
      </div>
      {menus.length > 0 && (
        <ul className="divide-y divide-line">
          {menus.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={`font-medium ${p.activo ? '' : 'text-muted line-through'}`}>
                  {p.nombreEs}
                </span>
                <span className="ml-2 text-sm text-muted">{precio(p.precio)}</span>
                <span className="block text-xs text-muted">{cuando(p)}</span>
              </span>
              {esHoy(p) && p.activo && <Etiqueta tono="ok">Hoy</Etiqueta>}
              <Link
                to={`/panel/menu/plato/${p.id}`}
                aria-label={`Editar ${p.nombreEs}`}
                className="grid size-11 place-items-center rounded-md hover:bg-surface"
              >
                <Pencil className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
