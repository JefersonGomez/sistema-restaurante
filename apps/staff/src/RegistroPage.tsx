import { Store, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planSchema, registroSchema } from '@menu-qr/shared';
import { PROBO_DEMO } from './DemoPage';
import { Cargando } from '@menu-qr/ui';
import type { ErrorApi } from './api';
import { useAuth } from './auth';
import { Boton, Campo, erroresDe } from './panel/comunes';

// Registro de un restaurante nuevo en dos pasos: datos del local y datos del dueño. Al terminar
// el dueño entra directo a su panel.
const proboDemo = () => {
  try {
    return localStorage.getItem(PROBO_DEMO) === '1';
  } catch {
    return false;
  }
};

export function RegistroPage() {
  const { registrar } = useAuth();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [f, setF] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    duenoNombre: '',
    email: '',
    password: '',
    repetir: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  // El botón del plan en la landing manda ?plan=EN_LINEA (o BASICO); si no, mes de prueba Completo.
  const [buscar] = useSearchParams();
  const planElegido = planSchema.safeParse(buscar.get('plan')).data;
  const poner = (k: keyof typeof f, v: string) => {
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };
  const datos = () => ({
    restaurante: {
      nombre: f.nombre,
      telefono: f.telefono,
      direccion: f.direccion.trim() || undefined,
      plan: planElegido,
      vieneDeDemo: proboDemo(),
    },
    dueno: { nombre: f.duenoNombre, email: f.email, password: f.password },
  });
  // Errores de Zod con rutas "restaurante.nombre" → claves del formulario.
  const aCampos = (e: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(e).map(([k, v]) => [
        {
          'restaurante.nombre': 'nombre',
          'restaurante.telefono': 'telefono',
          'restaurante.direccion': 'direccion',
          'dueno.nombre': 'duenoNombre',
          'dueno.email': 'email',
          'dueno.password': 'password',
        }[k] ?? 'general',
        v,
      ]),
    );

  const siguiente = (e: FormEvent) => {
    e.preventDefault();
    const r = registroSchema.shape.restaurante.safeParse(datos().restaurante);
    if (!r.success) return setErrores(aCampos(erroresDe(r.error, 'restaurante.')));
    setPaso(2);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const r = registroSchema.safeParse(datos());
    if (!r.success) return setErrores(aCampos(erroresDe(r.error)));
    if (f.password !== f.repetir) return setErrores({ repetir: 'Las contraseñas no coinciden' });
    setEnviando(true);
    try {
      await registrar(r.data);
    } catch (err) {
      const x = err as ErrorApi;
      setErrores(x.code === 'CORREO_EN_USO' ? { email: x.message } : { general: x.message });
      setEnviando(false);
    }
  };

  const pasos = [
    { n: 1, texto: 'Su local', Icono: Store },
    { n: 2, texto: 'Sus datos', Icono: UserRound },
  ] as const;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      {enviando && (
        <div className="anim-aparecer fixed inset-0 z-50">
          <Cargando texto="Creando su restaurante…" />
        </div>
      )}
      <form
        onSubmit={paso === 1 ? siguiente : enviar}
        noValidate
        className="anim-entrar w-full max-w-md space-y-4 rounded-[26px] bg-app p-6 shadow-app"
      >
        <div>
          <p className="mb-3 font-display text-lg font-extrabold tracking-[-0.02em] text-purple">
            KitchaGo
          </p>
          <h1 className="text-[22px] font-semibold">Cree la cuenta de su restaurante</h1>
          <p className="mt-1 text-sm text-muted">
            En dos minutos tiene su menú con QR. Después puede agregar el logo, el banner y la
            ubicación.
          </p>
        </div>
        <ol className="flex gap-2" aria-label="Pasos">
          {pasos.map(({ n, texto, Icono }) => (
            <li
              key={n}
              aria-current={paso === n ? 'step' : undefined}
              className={`flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                paso === n ? 'bg-purple-soft text-purple' : 'bg-surface text-muted'
              }`}
            >
              <Icono className="size-4" aria-hidden /> {n}. {texto}
            </li>
          ))}
        </ol>

        {paso === 1 ? (
          <div key="1" className="anim-entrar space-y-3">
            <Campo
              etiqueta="Nombre del local"
              placeholder="Soda La Esquina"
              autoComplete="organization"
              value={f.nombre}
              onChange={(e) => poner('nombre', e.target.value)}
              error={errores.nombre}
            />
            <Campo
              etiqueta="Teléfono"
              type="tel"
              placeholder="8888 8888"
              autoComplete="tel"
              value={f.telefono}
              onChange={(e) => poner('telefono', e.target.value)}
              error={errores.telefono}
            />
            <Campo
              etiqueta="Dirección (opcional)"
              placeholder="100 m norte de la iglesia, San José"
              autoComplete="street-address"
              value={f.direccion}
              onChange={(e) => poner('direccion', e.target.value)}
              error={errores.direccion}
            />
            <Boton type="submit" className="h-14 w-full text-[15.5px]">
              Continuar
            </Boton>
          </div>
        ) : (
          <div key="2" className="anim-entrar space-y-3">
            <Campo
              etiqueta="Su nombre"
              autoComplete="name"
              value={f.duenoNombre}
              onChange={(e) => poner('duenoNombre', e.target.value)}
              error={errores.duenoNombre}
            />
            <Campo
              etiqueta="Correo"
              type="email"
              autoComplete="email"
              value={f.email}
              onChange={(e) => poner('email', e.target.value)}
              error={errores.email}
              ayuda="Con este correo va a entrar al panel"
            />
            <Campo
              etiqueta="Contraseña"
              type="password"
              autoComplete="new-password"
              value={f.password}
              onChange={(e) => poner('password', e.target.value)}
              error={errores.password}
              ayuda="Mínimo 8 caracteres"
            />
            <Campo
              etiqueta="Repita la contraseña"
              type="password"
              autoComplete="new-password"
              value={f.repetir}
              onChange={(e) => poner('repetir', e.target.value)}
              error={errores.repetir}
            />
            {errores.general && (
              <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                {errores.general}
              </p>
            )}
            <div className="flex gap-2">
              <Boton variante="suave" className="h-14" onClick={() => setPaso(1)}>
                Atrás
              </Boton>
              <Boton type="submit" disabled={enviando} className="h-14 flex-1 text-[15.5px]">
                Crear mi restaurante
              </Boton>
            </div>
          </div>
        )}
        <p className="text-center text-sm text-muted">
          ¿Ya tiene cuenta?{' '}
          <Link to="/login" className="font-semibold text-purple underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
