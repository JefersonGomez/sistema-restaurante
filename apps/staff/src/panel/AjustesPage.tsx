import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  acentoLegible,
  restauranteConfigSchema,
  type Idioma,
  type ModoConfirmacion,
  type Moneda,
} from '@menu-qr/shared';
import { api, subirImagen, type ErrorApi } from '../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from './comunes';
import { aCentimos, aColones } from './menu/PlatoForm';

type Turno = { diaSemana: number; abre: string; cierra: string };
type Restaurante = {
  nombre: string;
  logoUrl: string | null;
  colorAcento: string | null;
  moneda: Moneda;
  idiomas: Idioma[];
  porcentajeIva: number;
  porcentajeServicio: number;
  preciosIncluyenImpuestos: boolean;
  modoConfirmacion: ModoConfirmacion;
  zonaHoraria: string;
  cerradoManual: boolean;
  platoDestacadoId: string | null;
  textoPromoEs: string | null;
  textoPromoEn: string | null;
  precioPromo: number | null;
  horarios: Turno[];
};

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const diaDe = (i: number) => (i + 1) % 7; // índice de la lista (lunes primero) → diaSemana (0 = domingo)
const MORADO = '#5b2db5';
const MODOS: { id: ModoConfirmacion; texto: string }[] = [
  { id: 'SIEMPRE', texto: 'Siempre: el mesero confirma cada pedido' },
  { id: 'PRIMER_PEDIDO', texto: 'Solo el primer pedido de cada mesa' },
  { id: 'NUNCA', texto: 'Nunca: los pedidos van directo a cocina' },
];
const select = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {detalle && <p className="text-sm text-muted">{detalle}</p>}
      </div>
      {children}
    </Tarjeta>
  );
}

function Horarios({ inicial }: { inicial: Turno[] }) {
  const qc = useQueryClient();
  const [turnos, setTurnos] = useState(inicial);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const guardar = useMutation({
    mutationFn: () => api('/restaurante/horarios', { method: 'PUT', body: { turnos } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] });
      setGuardado(true);
    },
    onError: (e: ErrorApi) => setError(e.message),
  });
  const cambiar = (t: Turno, cambio: Partial<Turno>) => {
    setGuardado(false);
    setTurnos((ts) => ts.map((x) => (x === t ? { ...x, ...cambio } : x)));
  };
  const enviar = () => {
    // Si cierra antes de abrir, se entiende que cierra después de medianoche (lo permite la API).
    if (turnos.some((t) => t.abre === t.cierra))
      return setError('Un turno no puede abrir y cerrar a la misma hora');
    setError('');
    guardar.mutate();
  };

  return (
    <Seccion
      titulo="Horario de atención"
      detalle="Puede poner varios turnos por día (ej. almuerzo y cena). Fuera de horario el menú se ve, pero no recibe pedidos."
    >
      <ul className="divide-y divide-line">
        {DIAS.map((nombre, i) => {
          const dia = diaDe(i);
          const delDia = turnos.filter((t) => t.diaSemana === dia);
          return (
            <li key={dia} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-24 font-medium">{nombre}</span>
              <div className="flex flex-1 flex-col gap-2">
                {delDia.length === 0 && <span className="text-sm text-muted">Cerrado</span>}
                {delDia.map((t, j) => (
                  <span key={j} className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${nombre}: abre`}
                      value={t.abre}
                      onChange={(e) => cambiar(t, { abre: e.target.value })}
                      className="h-11 rounded-xl border border-line bg-surface px-2"
                    />
                    <span className="text-muted">a</span>
                    <input
                      type="time"
                      aria-label={`${nombre}: cierra`}
                      value={t.cierra}
                      onChange={(e) => cambiar(t, { cierra: e.target.value })}
                      className="h-11 rounded-xl border border-line bg-surface px-2"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar turno del ${nombre}`}
                      onClick={() => setTurnos((ts) => ts.filter((x) => x !== t))}
                      className="grid size-11 place-items-center rounded-md hover:bg-surface"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setTurnos((ts) => [
                    ...ts,
                    { diaSemana: dia, abre: delDia.at(-1)?.cierra ?? '11:00', cierra: '22:00' },
                  ])
                }
                className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-purple hover:bg-purple-soft"
              >
                <Plus className="size-4" aria-hidden /> Turno
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          Guardar horario
        </Boton>
        {guardado && (
          <span role="status" className="text-sm text-ok">
            Horario guardado
          </span>
        )}
      </div>
    </Seccion>
  );
}

function Formulario({ r }: { r: Restaurante }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: r.nombre,
    logoUrl: r.logoUrl,
    colorAcento: r.colorAcento,
    moneda: r.moneda,
    idiomas: r.idiomas,
    porcentajeIva: String(r.porcentajeIva),
    porcentajeServicio: String(r.porcentajeServicio),
    preciosIncluyenImpuestos: r.preciosIncluyenImpuestos,
    modoConfirmacion: r.modoConfirmacion,
    platoDestacadoId: r.platoDestacadoId ?? '',
    textoPromoEs: r.textoPromoEs ?? '',
    textoPromoEn: r.textoPromoEn ?? '',
    precioPromo: r.precioPromo === null ? '' : aColones(r.precioPromo),
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const platos = useQuery({
    queryKey: ['platos'],
    queryFn: () => api<{ id: string; nombreEs: string }[]>('/platos'),
  });
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setGuardado(false);
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };

  const guardar = useMutation({
    mutationFn: (body: object) => api<Restaurante>('/restaurante', { method: 'PATCH', body }),
    onSuccess: (nuevo) => {
      qc.setQueryData(['restaurante'], nuevo);
      setGuardado(true);
    },
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = () => {
    const precioPromo = f.precioPromo.trim() ? aCentimos(f.precioPromo) : null;
    if (precioPromo === null && f.precioPromo.trim())
      return setErrores({ precioPromo: 'Escriba el precio en colones, por ejemplo 3500' });
    const r = restauranteConfigSchema.safeParse({
      ...f,
      porcentajeIva: Number(f.porcentajeIva),
      porcentajeServicio: Number(f.porcentajeServicio),
      platoDestacadoId: f.platoDestacadoId || null,
      textoPromoEs: f.textoPromoEs.trim() || null,
      textoPromoEn: f.textoPromoEn.trim() || null,
      precioPromo: f.platoDestacadoId ? precioPromo : null,
    });
    if (!r.success) return setErrores(erroresDe(r.error));
    guardar.mutate(r.data);
  };

  const subirLogo = async (archivo: File) => {
    setSubiendo(true);
    try {
      poner('logoUrl', (await subirImagen<{ url: string }>(archivo, 'logo')).url);
    } catch (e) {
      setErrores({ logoUrl: (e as Error).message });
    } finally {
      setSubiendo(false);
    }
  };

  const acento = f.colorAcento ?? MORADO;
  const legible = acentoLegible(acento);

  return (
    <>
      <Seccion titulo="Datos del restaurante">
        <Campo
          etiqueta="Nombre"
          value={f.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          error={errores.nombre}
        />
        <div className="flex flex-wrap items-center gap-3">
          {f.logoUrl ? (
            <img
              src={f.logoUrl}
              alt="Logo actual"
              className="size-16 rounded-full bg-surface object-cover"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-surface text-xs text-muted">
              Sin logo
            </span>
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
            <Upload className="size-4" aria-hidden /> {subiendo ? 'Subiendo…' : 'Subir logo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={subiendo}
              onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])}
            />
          </label>
          {f.logoUrl && (
            <Boton variante="suave" onClick={() => poner('logoUrl', null)}>
              Quitar
            </Boton>
          )}
          {errores.logoUrl && <p className="w-full text-sm text-danger">{errores.logoUrl}</p>}
        </div>
      </Seccion>

      <Seccion
        titulo="Color del menú"
        detalle="El color de los botones que ve el cliente. Tiene que ser oscuro para que el texto blanco se lea."
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Elegir color"
            value={acento}
            onChange={(e) => poner('colorAcento', e.target.value)}
            className="h-11 w-16 cursor-pointer rounded-md border border-line bg-surface"
          />
          <Campo
            etiqueta="Código"
            className="w-32"
            value={f.colorAcento ?? ''}
            placeholder={MORADO}
            onChange={(e) => poner('colorAcento', e.target.value || null)}
          />
          <span
            style={{ background: acento }}
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-white"
          >
            Agregar al pedido
          </span>
          {f.colorAcento && (
            <Boton variante="suave" onClick={() => poner('colorAcento', null)}>
              Usar el morado original
            </Boton>
          )}
        </div>
        {(errores.colorAcento || !legible) && (
          <p role="alert" className="text-sm text-danger">
            {errores.colorAcento ??
              'Ese color no contrasta con el texto blanco; elija uno más oscuro'}
          </p>
        )}
      </Seccion>

      <Seccion titulo="Idiomas y moneda">
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 font-medium">Idiomas del menú</legend>
          {(['es', 'en'] as const).map((i) => (
            <label key={i} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5 accent-purple"
                checked={f.idiomas.includes(i)}
                onChange={() =>
                  poner(
                    'idiomas',
                    f.idiomas.includes(i) ? f.idiomas.filter((x) => x !== i) : [...f.idiomas, i],
                  )
                }
              />
              {i === 'es' ? 'Español' : 'Inglés'}
            </label>
          ))}
        </fieldset>
        {errores.idiomas && <p className="text-sm text-danger">Elija al menos un idioma</p>}
        <label className="block max-w-xs text-sm">
          <span className="font-medium">Moneda</span>
          <select
            value={f.moneda}
            onChange={(e) => poner('moneda', e.target.value as Moneda)}
            className={select}
          >
            <option value="CRC">Colones (₡)</option>
            <option value="USD">Dólares ($)</option>
          </select>
        </label>
      </Seccion>

      <Seccion titulo="Impuestos" detalle="El servicio se calcula sobre el precio sin IVA.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="IVA (%)"
            type="number"
            min={0}
            max={100}
            value={f.porcentajeIva}
            onChange={(e) => poner('porcentajeIva', e.target.value)}
            error={errores.porcentajeIva}
          />
          <Campo
            etiqueta="Servicio (%)"
            type="number"
            min={0}
            max={100}
            value={f.porcentajeServicio}
            onChange={(e) => poner('porcentajeServicio', e.target.value)}
            error={errores.porcentajeServicio}
          />
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>Los precios del menú ya incluyen el IVA</span>
          <Interruptor
            activo={f.preciosIncluyenImpuestos}
            etiqueta="Los precios incluyen IVA"
            onCambio={(v) => poner('preciosIncluyenImpuestos', v)}
          />
        </label>
      </Seccion>

      <Seccion
        titulo="Confirmación de pedidos"
        detalle="Cuándo tiene que aprobar un mesero lo que pide el cliente desde el QR."
      >
        <fieldset className="space-y-1 text-sm">
          <legend className="sr-only">Confirmación de pedidos</legend>
          {MODOS.map((m) => (
            <label key={m.id} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="modo"
                className="size-5 accent-purple"
                checked={f.modoConfirmacion === m.id}
                onChange={() => poner('modoConfirmacion', m.id)}
              />
              {m.texto}
            </label>
          ))}
        </fieldset>
      </Seccion>

      <Seccion
        titulo="Promoción"
        detalle="Aparece como banner arriba del menú. Si pone precio de promoción, ese es el que se cobra."
      >
        <label className="block text-sm">
          <span className="font-medium">Plato en promoción</span>
          <select
            value={f.platoDestacadoId}
            onChange={(e) => poner('platoDestacadoId', e.target.value)}
            className={select}
          >
            <option value="">Sin promoción</option>
            {platos.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombreEs}
              </option>
            ))}
          </select>
        </label>
        {f.platoDestacadoId && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              etiqueta="Texto (español)"
              maxLength={80}
              placeholder="Jueves de"
              value={f.textoPromoEs}
              onChange={(e) => poner('textoPromoEs', e.target.value)}
              error={errores.textoPromoEs}
            />
            {f.idiomas.includes('en') && (
              <Campo
                etiqueta="Texto (inglés)"
                maxLength={80}
                placeholder="Thursday special"
                value={f.textoPromoEn}
                onChange={(e) => poner('textoPromoEn', e.target.value)}
                error={errores.textoPromoEn}
              />
            )}
            <Campo
              etiqueta="Precio de promoción (opcional)"
              inputMode="decimal"
              placeholder="3500"
              value={f.precioPromo}
              onChange={(e) => poner('precioPromo', e.target.value)}
              error={errores.precioPromo}
            />
          </div>
        )}
      </Seccion>

      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-lg bg-app p-3 shadow-tarjeta md:bottom-4">
        <Boton onClick={enviar} disabled={guardar.isPending || subiendo || !legible}>
          Guardar cambios
        </Boton>
        {guardado && (
          <span role="status" className="text-sm text-ok">
            Cambios guardados
          </span>
        )}
        {errores.general && (
          <span role="alert" className="text-sm text-danger">
            {errores.general}
          </span>
        )}
      </div>
    </>
  );
}

export function AjustesPage() {
  const qc = useQueryClient();
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<Restaurante>('/restaurante'),
  });
  const cerrar = useMutation({
    mutationFn: (cerradoManual: boolean) =>
      api<Restaurante>('/restaurante', { method: 'PATCH', body: { cerradoManual } }),
    onSuccess: (r) => qc.setQueryData(['restaurante'], r),
  });

  if (restaurante.isError)
    return (
      <ErrorCarga
        mensaje="No se pudieron cargar los ajustes"
        onReintentar={() => restaurante.refetch()}
      />
    );
  const r = restaurante.data;
  return (
    <>
      <TituloPagina
        titulo="Ajustes"
        detalle="Datos del restaurante, horario, impuestos y promoción."
      />
      {!r ? (
        <Esqueleto className="h-96" />
      ) : (
        <div className="max-w-3xl space-y-4">
          <Tarjeta
            className={`flex items-center justify-between gap-3 ${r.cerradoManual ? 'bg-amber-soft text-amber-ink' : ''}`}
          >
            <div>
              <p className="font-semibold">Cerrar temporalmente</p>
              <p className="text-sm">
                {r.cerradoManual
                  ? 'El menú no recibe pedidos hasta que lo vuelva a abrir.'
                  : 'Deja de recibir pedidos por el QR sin cambiar el horario.'}
              </p>
            </div>
            <Interruptor
              activo={r.cerradoManual}
              etiqueta="Cerrar temporalmente"
              disabled={cerrar.isPending}
              onCambio={(v) => cerrar.mutate(v)}
            />
          </Tarjeta>
          <Horarios inicial={r.horarios} />
          <Formulario r={r} />
        </div>
      )}
    </>
  );
}
