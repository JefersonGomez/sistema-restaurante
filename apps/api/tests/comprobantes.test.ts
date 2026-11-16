import forge from 'node-forge';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { cifrar } from '../src/lib/cifrado';
import { env } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { procesarCola } from '../src/modules/factura/factura.service';
import { consultar, enviar, ErrorHacienda } from '../src/modules/factura/hacienda';
import {
  abrirSesion,
  crearRestaurante,
  crearUsuario,
  limpiarBD,
  nuevoRequestId,
  sembrarMenu,
  tokenDe,
} from './helpers';

// Hacienda simulada: los tests no salen a internet.
vi.mock('../src/modules/factura/hacienda', async (original) => ({
  ...(await original<typeof import('../src/modules/factura/hacienda')>()),
  enviar: vi.fn(),
  consultar: vi.fn(),
}));

let p12: Buffer;
let restauranteId: string;
let caja: string;
let cuentaId: string;
let m: Awaited<ReturnType<typeof sembrarMenu>>;

beforeAll(() => {
  env.EINVOICE_SECRET ??= 'secreto-de-prueba-para-cifrar-credenciales-123';
  env.HACIENDA_PROVEEDOR_ID ??= '123456789';
  const llaves = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ shortName: 'CN', value: 'Prueba' }]);
  cert.setIssuer([{ shortName: 'CN', value: 'Prueba' }]);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], '1234', { algorithm: '3des' });
  p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
});

const configurar = (data: object = {}) =>
  prisma.configHacienda.create({
    data: {
      restauranteId,
      activa: true,
      tipoId: '01',
      numeroId: '123456789',
      nombre: 'Soda de Prueba',
      correo: 'soda@prueba.test',
      provincia: 1,
      canton: 1,
      distrito: 1,
      otrasSenas: 'Frente al parque central',
      actividad: '5610.0',
      usuarioCifrado: cifrar('cpf-01-2345-6789@stag.comprobanteselectronicos.go.cr'),
      claveCifrada: cifrar('clave'),
      llaveCifrada: cifrar(p12),
      pinCifrado: cifrar('1234'),
      ...data,
    },
  });
const cerrar = (body: object = { metodoPago: 'EFECTIVO' }) =>
  request(app)
    .post(`/operacion/cuentas/${cuentaId}/cerrar`)
    .set('Authorization', `Bearer ${caja}`)
    .send(body);
const comprobantes = () => prisma.comprobante.findMany({ orderBy: { createdAt: 'asc' } });
// Vuelve a dejar listo para procesar (sin esperar el tiempo de reintento).
const yaToca = () =>
  prisma.comprobante.updateMany({ data: { proximoIntento: new Date(Date.now() - 1000) } });

beforeEach(async () => {
  vi.mocked(enviar).mockReset();
  vi.mocked(consultar).mockReset();
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  restauranteId = restaurante.id;
  m = await sembrarMenu(restauranteId);
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: { modoConfirmacion: 'NUNCA', cabysGeneral: '6331000000000' },
  });
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  caja = await tokenDe('caja@resto-a.test');
  const s = await abrirSesion(m.mesa.tokenQr);
  cuentaId = s.cuentaId;
  await request(app)
    .post('/public/cuenta/pedidos')
    .set('Authorization', `Bearer ${s.token}`)
    .send({
      clientRequestId: nuevoRequestId(),
      items: [
        { platoId: m.casado, cantidad: 1, modificadores: [m.termino[0]] },
        { platoId: m.refresco, cantidad: 2 },
      ],
    });
});

describe('comprobantes al cobrar (Fase 15.2)', () => {
  it('sin configuración activa no emite nada', async () => {
    expect((await cerrar()).status).toBe(200);
    await configurar({ activa: false });
    expect(await comprobantes()).toHaveLength(0);
  });

  it('cerrar la cuenta emite un tiquete firmado que la cola envía y queda aceptado', async () => {
    await configurar();
    const { total } = (await cerrar()).body;
    const [c] = await comprobantes();
    expect(c).toMatchObject({ tipo: 'TE', estado: 'PENDIENTE', total, cuentaId });
    expect(c!.clave).toHaveLength(50);
    expect(c!.xmlFirmado).toContain('<CodigoCABYS>6331000000000</CodigoCABYS>');
    expect(c!.xmlFirmado).toContain('<TipoDocumentoOC>06</TipoDocumentoOC>');
    expect(c!.xmlFirmado).toContain('<TipoMedioPago>01</TipoMedioPago>');
    expect(c!.xmlFirmado).toContain('<ds:Signature');
    // Las credenciales se guardan cifradas.
    const cfg = await prisma.configHacienda.findFirstOrThrow();
    expect(cfg.claveCifrada).not.toContain('clave');
    expect(cfg.siguienteTiquete).toBe(2);

    vi.mocked(enviar).mockResolvedValue();
    expect(await procesarCola()).toBe(1);
    expect(vi.mocked(enviar).mock.calls[0]![1]).toMatchObject({
      clave: c!.clave,
      emisor: { tipo: '01', numero: '123456789' },
    });
    expect((await comprobantes())[0]!.estado).toBe('ENVIADO');

    vi.mocked(consultar).mockResolvedValue({ estado: 'procesando' });
    await yaToca();
    await procesarCola();
    expect((await comprobantes())[0]!.estado).toBe('ENVIADO');

    vi.mocked(consultar).mockResolvedValue({ estado: 'aceptado', mensaje: 'Aceptado' });
    await yaToca();
    await procesarCola();
    expect((await comprobantes())[0]).toMatchObject({ estado: 'ACEPTADO', mensaje: 'Aceptado' });
  });

  it('si Hacienda no responde, el cobro sigue y el comprobante se reintenta después', async () => {
    await configurar();
    await cerrar();
    vi.mocked(enviar).mockRejectedValue(new TypeError('fetch failed'));
    await procesarCola();
    const [c] = await comprobantes();
    expect(c).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    expect(c!.proximoIntento.getTime()).toBeGreaterThan(Date.now());
    expect(await procesarCola()).toBe(0); // todavía no le toca

    vi.mocked(enviar).mockResolvedValue();
    await yaToca();
    await procesarCola();
    expect((await comprobantes())[0]!.estado).toBe('ENVIADO');
  });

  it('un comprobante inválido para Hacienda queda en error; uno rechazado guarda el motivo', async () => {
    await configurar();
    await cerrar();
    vi.mocked(enviar).mockRejectedValue(
      new ErrorHacienda('Hacienda no recibió el comprobante (400)', 400, 'XML mal formado'),
    );
    await procesarCola();
    expect((await comprobantes())[0]).toMatchObject({
      estado: 'ERROR',
      mensaje: expect.stringContaining('XML mal formado'),
    });

    await prisma.comprobante.updateMany({ data: { estado: 'ENVIADO' } });
    vi.mocked(consultar).mockResolvedValue({ estado: 'rechazado', mensaje: 'Clave duplicada' });
    await yaToca();
    await procesarCola();
    expect((await comprobantes())[0]).toMatchObject({
      estado: 'RECHAZADO',
      mensaje: 'Clave duplicada',
    });
  });

  it('sin CABYS general queda en error con el motivo, sin afectar el cobro', async () => {
    await prisma.restaurante.update({ where: { id: restauranteId }, data: { cabysGeneral: null } });
    await configurar();
    expect((await cerrar()).status).toBe(200);
    expect((await comprobantes())[0]).toMatchObject({
      estado: 'ERROR',
      mensaje: expect.stringContaining('CABYS'),
    });
  });

  it('cuentas separadas: un comprobante por grupo, con sus platos', async () => {
    await configurar();
    const cuenta = await request(app)
      .get(`/operacion/cuentas/${cuentaId}`)
      .set('Authorization', `Bearer ${caja}`);
    const [casado] = cuenta.body.pedidos.flatMap((p: { items: { id: string }[] }) => p.items);
    const r = await request(app)
      .post(`/operacion/cuentas/${cuentaId}/pagos`)
      .set('Authorization', `Bearer ${caja}`)
      .send({ metodoPago: 'SINPE', items: [{ itemId: casado.id, cantidad: 1 }] });
    expect(r.status).toBe(200);
    const [c] = await comprobantes();
    expect(c).toMatchObject({ pagoId: r.body.pagoId, total: r.body.cuenta.pagos[0].total });
    expect(c!.xmlFirmado).toContain('<TipoMedioPago>06</TipoMedioPago>');
    expect(c!.xmlFirmado).not.toContain('Refresco');
  });
});
