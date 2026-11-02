import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ClientePerfil, MenuPublico } from '@menu-qr/shared';
import { formatoPrecio } from '@menu-qr/ui';
import * as api from '../api';
import { BarraTitulo, Main } from '../componentes/estructura';
import { PuntoEntrega, type Punto } from '../componentes/mapa';
import { TarjetaSellos } from '../componentes/sellos';
import { usePerfilCliente } from '../estado/cuentaCliente';
import { useTextos } from '../estado/idioma';

const claseCampo = 'mt-1 h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg';
const botonPrincipal =
  'flex h-12 w-full items-center justify-center rounded-md bg-purple font-semibold text-on-accent disabled:opacity-60';

function Campo({
  etiqueta,
  ...props
}: { etiqueta: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{etiqueta}</span>
      <input className={claseCampo} {...props} />
    </label>
  );
}

// "¿Olvidó su contraseña?": manda el enlace al correo (la respuesta es la misma exista o no).
function Olvide({ slug, email }: { slug: string; email: string }) {
  const t = useTextos();
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState(email);
  const [enviado, setEnviado] = useState(false);
  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => {
          setCorreo(email);
          setAbierto(true);
        }}
        className="text-center text-sm text-muted underline"
      >
        {t.clienteOlvido}
      </button>
    );
  if (enviado)
    return <p className="rounded-md bg-ok-soft p-3 text-sm text-ok">{t.clienteEnlaceEnviado}</p>;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface p-3">
      <Campo
        etiqueta={t.clienteCorreo}
        type="email"
        autoComplete="email"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <button
        type="button"
        disabled={!correo.includes('@')}
        onClick={async () => {
          await api.olvideCliente(slug, correo.trim()).catch(() => {});
          setEnviado(true);
        }}
        className="flex h-11 items-center justify-center rounded-md bg-app font-semibold disabled:opacity-50"
      >
        {t.clienteEnviarEnlace}
      </button>
    </div>
  );
}

// /r/:slug/restablecer?token=…: contraseña nueva con el enlace del correo.
export function RestablecerCliente({ slug }: { slug: string }) {
  const t = useTextos();
  const navegar = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const token = new URLSearchParams(location.search).get('token') ?? '';

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.restablecerCliente(slug, token, password);
      setListo(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Main>
      <BarraTitulo titulo={t.clienteContrasenaNueva} onVolver={() => navegar(`/r/${slug}`)} />
      <div className="mx-auto w-full max-w-md">
        {listo ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-md bg-ok-soft p-3 text-sm text-ok">{t.clienteContrasenaLista}</p>
            <Link to={`/r/${slug}/cuenta`} className={botonPrincipal}>
              {t.clienteEntrar}
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <Campo
              etiqueta={t.clienteContrasenaNueva}
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder={t.clienteContrasenaMin}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={!token} className={botonPrincipal}>
              {t.clienteGuardarContrasena}
            </button>
          </form>
        )}
      </div>
    </Main>
  );
}

// Entrar o crear cuenta.
function Acceso({ slug, onSesion }: { slug: string; onSesion: (token: string) => void }) {
  const t = useTextos();
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [f, setF] = useState({ nombre: '', telefono: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const poner = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const s =
        modo === 'entrar'
          ? await api.entrarCliente(slug, f.email.trim(), f.password)
          : await api.registrarCliente(slug, { ...f, email: f.email.trim() });
      onSesion(s.token);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  };

  const pestana = (m: typeof modo, texto: string) => (
    <button
      type="button"
      aria-pressed={modo === m}
      onClick={() => setModo(m)}
      className={`min-h-11 flex-1 rounded-md text-sm font-semibold ${modo === m ? 'bg-purple text-on-accent' : 'bg-surface'}`}
    >
      {texto}
    </button>
  );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.clienteBeneficio}</p>
      <div className="flex gap-2">
        {pestana('entrar', t.clienteEntrar)}
        {pestana('crear', t.clienteCrear)}
      </div>
      {modo === 'crear' && (
        <>
          <Campo
            etiqueta={t.nombre}
            value={f.nombre}
            onChange={poner('nombre')}
            autoComplete="name"
            required
          />
          <Campo
            etiqueta={t.telefono}
            value={f.telefono}
            onChange={poner('telefono')}
            type="tel"
            autoComplete="tel"
            placeholder="8888 8888"
            required
          />
        </>
      )}
      <Campo
        etiqueta={t.clienteCorreo}
        value={f.email}
        onChange={poner('email')}
        type="email"
        autoComplete="email"
        required
      />
      <Campo
        etiqueta={t.clienteContrasena}
        value={f.password}
        onChange={poner('password')}
        type="password"
        autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
        minLength={modo === 'crear' ? 8 : undefined}
        placeholder={modo === 'crear' ? t.clienteContrasenaMin : undefined}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={enviando} className={botonPrincipal}>
        {modo === 'entrar' ? t.clienteEntrar : t.clienteCrear}
      </button>
      {modo === 'entrar' && <Olvide slug={slug} email={f.email} />}
    </form>
  );
}

// Mi cuenta: sellos, datos con la dirección y el punto del mapa, contraseña y pedidos.
function MiCuenta({
  slug,
  token,
  perfil,
  precio,
  onSalir,
}: {
  slug: string;
  token: string;
  perfil: ClientePerfil;
  precio: (n: number) => string;
  onSalir: () => void;
}) {
  const t = useTextos();
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: perfil.nombre,
    telefono: perfil.telefono,
    direccion: perfil.direccion ?? '',
    referencia: perfil.referencia ?? '',
  });
  const [punto, setPunto] = useState<Punto | null>(perfil.ubicacion);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [claves, setClaves] = useState({ actual: '', nueva: '' });
  const poner = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const guardarDatos = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const nuevo = await api.guardarPerfil(slug, token, {
        nombre: f.nombre.trim(),
        telefono: f.telefono.trim(),
        direccion: f.direccion.trim() || null,
        referencia: f.referencia.trim() || null,
        ubicacion: punto,
      });
      qc.setQueryData(['perfil', slug, token], nuevo);
      setAviso({ ok: true, texto: t.clienteGuardado });
    } catch (err) {
      setAviso({ ok: false, texto: (err as Error).message });
    }
  };
  const cambiarClave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.cambiarContrasena(slug, token, claves.actual, claves.nueva);
      setClaves({ actual: '', nueva: '' });
      setAviso({ ok: true, texto: t.clienteContrasenaCambiada });
    } catch (err) {
      setAviso({ ok: false, texto: (err as Error).message });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-semibold">{t.clienteHola(perfil.nombre)}</p>
        <p className="text-sm text-muted">{perfil.email}</p>
      </div>
      {perfil.fidelidad && <TarjetaSellos f={perfil.fidelidad} />}
      {aviso && (
        <p
          role="status"
          className={`rounded-md p-3 text-sm ${aviso.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          {aviso.texto}
        </p>
      )}

      <form onSubmit={guardarDatos} className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.susDatos}</h2>
        <Campo etiqueta={t.nombre} value={f.nombre} onChange={poner('nombre')} required />
        <Campo
          etiqueta={t.telefono}
          value={f.telefono}
          onChange={poner('telefono')}
          type="tel"
          required
        />
        <Campo etiqueta={t.direccionEntrega} value={f.direccion} onChange={poner('direccion')} />
        <Campo
          etiqueta={t.referencia}
          value={f.referencia}
          onChange={poner('referencia')}
          placeholder={t.referenciaEjemplo}
        />
        <PuntoEntrega punto={punto} onCambio={setPunto} />
        <button type="submit" className={botonPrincipal}>
          {t.clienteGuardar}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t.clienteMisPedidos}</h2>
        {perfil.pedidos.length === 0 && <p className="text-sm text-muted">{t.clienteSinPedidos}</p>}
        <ul className="divide-y divide-line rounded-md bg-surface">
          {perfil.pedidos.map((p) => (
            <li key={p.token}>
              <Link
                to={`/seguimiento/${p.token}`}
                className="flex min-h-14 items-center gap-3 px-4 text-sm"
              >
                <span className="flex-1">
                  <span className="block font-medium">{t.pedidoNumero(p.numero)}</span>
                  <span className="text-xs text-muted">
                    {new Date(p.fecha).toLocaleDateString()} · {precio(p.total)}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <details>
        <summary className="cursor-pointer font-semibold">{t.clienteCambiarContrasena}</summary>
        <form onSubmit={cambiarClave} className="mt-3 flex flex-col gap-3">
          <Campo
            etiqueta={t.clienteContrasenaActual}
            type="password"
            autoComplete="current-password"
            value={claves.actual}
            onChange={(e) => setClaves((c) => ({ ...c, actual: e.target.value }))}
            required
          />
          <Campo
            etiqueta={t.clienteContrasenaNueva}
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder={t.clienteContrasenaMin}
            value={claves.nueva}
            onChange={(e) => setClaves((c) => ({ ...c, nueva: e.target.value }))}
            required
          />
          <button
            type="submit"
            className="flex h-12 items-center justify-center rounded-md bg-surface font-semibold"
          >
            {t.clienteCambiarContrasena}
          </button>
        </form>
      </details>

      <button
        type="button"
        onClick={onSalir}
        className="flex h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold text-muted"
      >
        <LogOut className="size-4" aria-hidden /> {t.clienteSalir}
      </button>
    </div>
  );
}

// /r/:slug/cuenta
export function CuentaCliente({ menu, slug }: { menu: MenuPublico; slug: string }) {
  const t = useTextos();
  const navegar = useNavigate();
  const { token, poner, perfil, cargando, salir } = usePerfilCliente(slug);
  const precio = formatoPrecio(menu.restaurante.moneda);
  // Recién entra: vuelve al pedido si venía del checkout.
  const [volverAlPedido] = useState(() => new URLSearchParams(location.search).has('pedido'));
  useEffect(() => {
    if (perfil && volverAlPedido) navegar(`/r/${slug}/pedido`, { replace: true });
  }, [perfil, volverAlPedido, navegar, slug]);

  return (
    <Main>
      <BarraTitulo titulo={t.clienteCuenta} onVolver={() => navegar(`/r/${slug}`)} />
      <div className="mx-auto w-full max-w-md">
        {!token ? (
          <Acceso slug={slug} onSesion={poner} />
        ) : cargando || !perfil ? (
          <div className="esqueleto h-60 rounded-lg" aria-busy="true" />
        ) : (
          <MiCuenta
            key={perfil.id}
            slug={slug}
            token={token}
            perfil={perfil}
            precio={precio}
            onSalir={salir}
          />
        )}
      </div>
    </Main>
  );
}
