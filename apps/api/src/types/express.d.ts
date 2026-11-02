import type { UsuarioToken } from '../lib/tokens';

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
      tenant?: { restauranteId: string };
      cliente?: { sesionId: string; cuentaId: string; restauranteId: string; mesaId: string };
      registrado?: { sesionId: string; clienteId: string }; // cuenta del cliente en línea
    }
  }
}
