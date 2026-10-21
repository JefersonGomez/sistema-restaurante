import { z } from 'zod';

export const rolSchema = z.enum(['SUPERADMIN', 'DUENO', 'MESERO', 'COCINA', 'CAJA']);
export type Rol = z.infer<typeof rolSchema>;

export const monedaSchema = z.enum(['CRC', 'USD']);
export type Moneda = z.infer<typeof monedaSchema>;

export const idiomaSchema = z.enum(['es', 'en']);
export type Idioma = z.infer<typeof idiomaSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;
