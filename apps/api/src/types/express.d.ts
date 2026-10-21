import type { UsuarioToken } from '../lib/tokens';

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}
