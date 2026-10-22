import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { actualizarUsuarioSchema, crearUsuarioSchema, type Rol } from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import { useAuth } from '../auth';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  Etiqueta,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from './comunes';

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  estacionId: string | null;
  activo: boolean;
  ultimoAcceso: string | null;
};
type Estacion = { id: string; nombre: string };

const ROLES: { id: Exclude<Rol, 'SUPERADMIN'>; texto: string }[] = [
  { id: 'MESERO', texto: 'Mesero' },
  { id: 'COCINA', texto: 'Cocina / bar' },
  { id: 'CAJA', texto: 'Caja' },
  { id: 'DUENO', texto: 'Dueño' },
];

const hace = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
};

const select = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

function FormUsuario({
  inicial,
  estaciones,
  onListo,
}: {
  inicial?: Usuario;
  estaciones: Estacion[];
  onListo: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? '',
    email: inicial?.email ?? '',
    password: '',
    rol: (inicial?.rol ?? 'MESERO') as Exclude<Rol, 'SUPERADMIN'>,
    estacionId: inicial?.estacionId ?? '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = useMutation({
    mutationFn: (body: object) =>
      inicial
        ? api(`/usuarios/${inicial.id}`, { method: 'PATCH', body })
        : api('/usuarios', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onListo();
    },
    onError: (e: ErrorApi) =>
      setErrores(
        e.code === 'DUPLICADO'
          ? { email: 'Ya hay alguien con ese correo' }
          : { general: e.message },
      ),
  });
  const enviar = () => {
    const cuerpo = {
      nombre: f.nombre,
      email: f.email,
      rol: f.rol,
      estacionId: f.rol === 'COCINA' && f.estacionId ? f.estacionId : null,
      ...(inicial && !f.password ? {} : { password: f.password }),
    };
    const r = (inicial ? actualizarUsuarioSchema : crearUsuarioSchema).safeParse(cuerpo);
    if (!r.success) return setErrores(erroresDe(r.error));
    setErrores({});
    guardar.mutate(r.data);
  };
  const poner = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Tarjeta className="space-y-3 border border-purple">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          value={f.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          error={errores.nombre}
        />
        <Campo
          etiqueta="Correo"
          type="email"
          value={f.email}
          onChange={(e) => poner('email', e.target.value)}
          error={errores.email}
        />
        <Campo
          etiqueta={inicial ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
          type="password"
          autoComplete="new-password"
          value={f.password}
          onChange={(e) => poner('password', e.target.value)}
          error={errores.password}
          ayuda="Mínimo 8 caracteres"
        />
        <label className="block text-sm">
          <span className="font-medium">Rol</span>
          <select value={f.rol} onChange={(e) => poner('rol', e.target.value)} className={select}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.texto}
              </option>
            ))}
          </select>
        </label>
        {f.rol === 'COCINA' && (
          <label className="block text-sm">
            <span className="font-medium">Estación</span>
            <select
              value={f.estacionId}
              onChange={(e) => poner('estacionId', e.target.value)}
              className={select}
            >
              <option value="">Todas (cocina y bar)</option>
              {estaciones.map((e) => (
                <option key={e.id} value={e.id}>
                  Solo {e.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {errores.general && <p className="text-sm text-danger">{errores.general}</p>}
      <div className="flex gap-2">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          {inicial ? 'Guardar' : 'Crear usuario'}
        </Boton>
        <Boton variante="suave" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </Tarjeta>
  );
}

export function PersonalPage() {
  const qc = useQueryClient();
  const { usuario: yo } = useAuth();
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [temporal, setTemporal] = useState<{ nombre: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });
  const estaciones = useQuery({
    queryKey: ['estaciones'],
    queryFn: () => api<Estacion[]>('/estaciones'),
  });

  const activar = useMutation({
    mutationFn: (u: { id: string; activo: boolean }) =>
      api(`/usuarios/${u.id}`, { method: 'PATCH', body: { activo: u.activo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (e: ErrorApi) => setError(e.message),
  });
  const restablecer = useMutation({
    mutationFn: (u: Usuario) =>
      api<{ passwordTemporal: string }>(`/usuarios/${u.id}/restablecer-password`, {
        method: 'POST',
      }),
    onSuccess: (r, u) => setTemporal({ nombre: u.nombre, password: r.passwordTemporal }),
  });

  if (usuarios.isError)
    return (
      <ErrorCarga mensaje="No se pudo cargar el personal" onReintentar={() => usuarios.refetch()} />
    );
  const nombreEstacion = (id: string | null) =>
    id ? estaciones.data?.find((e) => e.id === id)?.nombre : 'Todas';

  return (
    <>
      <TituloPagina
        titulo="Personal"
        detalle="Cada persona entra con su correo. Las cuentas desactivadas no pueden entrar."
        acciones={
          <Boton onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" aria-hidden /> Nuevo usuario
          </Boton>
        }
      />
      {temporal && (
        <div role="status" className="mb-4 rounded-md bg-ok-soft p-4 text-sm text-ok">
          <p className="font-semibold">Contraseña temporal de {temporal.nombre}</p>
          <p className="mt-1">
            Désela en persona:{' '}
            <code className="rounded bg-app px-2 py-1 text-base font-bold tracking-wider text-fg">
              {temporal.password}
            </code>
            . Al entrar, se le pedirá cambiarla. No se volverá a mostrar.
          </p>
          <Boton variante="suave" className="mt-2" onClick={() => setTemporal(null)}>
            Listo
          </Boton>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {editando === 'nuevo' && (
        <div className="mb-4">
          <FormUsuario estaciones={estaciones.data ?? []} onListo={() => setEditando(null)} />
        </div>
      )}

      {usuarios.isLoading ? (
        <Esqueleto className="h-64" />
      ) : (
        <ul className="space-y-2">
          {usuarios.data?.map((u) =>
            editando === u.id ? (
              <li key={u.id}>
                <FormUsuario
                  inicial={u}
                  estaciones={estaciones.data ?? []}
                  onListo={() => setEditando(null)}
                />
              </li>
            ) : (
              <li key={u.id}>
                <Tarjeta className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-[180px] flex-1">
                    <p className={`font-semibold ${u.activo ? '' : 'text-muted line-through'}`}>
                      {u.nombre}{' '}
                      {u.id === yo?.id && (
                        <span className="text-xs font-normal text-muted">(usted)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Etiqueta tono="purple">
                      {ROLES.find((r) => r.id === u.rol)?.texto ?? u.rol}
                    </Etiqueta>
                    {u.rol === 'COCINA' && (
                      <Etiqueta tono="neutro">{nombreEstacion(u.estacionId)}</Etiqueta>
                    )}
                    <span className="text-xs text-muted">
                      Último acceso: {hace(u.ultimoAcceso)}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Interruptor
                      activo={u.activo}
                      etiqueta={`${u.nombre} activo`}
                      disabled={u.id === yo?.id}
                      onCambio={(activo) => activar.mutate({ id: u.id, activo })}
                    />
                    <button
                      type="button"
                      aria-label={`Restablecer contraseña de ${u.nombre}`}
                      title="Restablecer contraseña"
                      onClick={() => restablecer.mutate(u)}
                      className="grid size-11 place-items-center rounded-md hover:bg-surface"
                    >
                      <KeyRound className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar ${u.nombre}`}
                      onClick={() => setEditando(u.id)}
                      className="grid size-11 place-items-center rounded-md hover:bg-surface"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  </div>
                </Tarjeta>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}
