import forge from 'node-forge';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { cifrar } from '../src/lib/cifrado';
import { correosEnviados } from '../src/lib/correo';
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

describe('factura, lista, reintento y configuración (Fase 15.3)', () => {
  const dueno = () => tokenDe('dueno@resto-a.test');

  it('con datos del cliente emite factura (FE) con el receptor; valida la cédula', async () => {
    await configurar();
    const mal = await cerrar({
      metodoPago: 'EFECTIVO',
      receptor: { tipoId: '01', numero: '12345678', nombre: 'Ana Solís' },
    });
    expect(mal.status).toBe(400);
    const r = await cerrar({
      metodoPago: 'EFECTIVO',
      receptor: { tipoId: '01', numero: '112340567', nombre: 'Ana Solís', correo: 'ana@x.test' },
    });
    expect(r.status).toBe(200);
    const [c] = await comprobantes();
    expect(c).toMatchObject({
      tipo: 'FE',
      receptorNumero: '112340567',
      receptorNombre: 'Ana Solís',
    });
    expect(c!.consecutivo.slice(8, 10)).toBe('01');
    expect(c!.xmlFirmado).toContain('<FacturaElectronica');
    expect(c!.xmlFirmado).toContain(
      '<Receptor><Nombre>Ana Solís</Nombre><Identificacion><Tipo>01</Tipo><Numero>112340567</Numero></Identificacion><CorreoElectronico>ana@x.test</CorreoElectronico></Receptor>',
    );
  });

  it('la caja ve los comprobantes y reintenta los que quedaron en error', async () => {
    await prisma.restaurante.update({ where: { id: restauranteId }, data: { cabysGeneral: null } });
    await configurar();
    await cerrar();
    const lista = await request(app).get('/comprobantes').set('Authorization', `Bearer ${caja}`);
    expect(lista.body).toMatchObject({
      activa: true,
      comprobantes: [{ estado: 'ERROR', lugar: 'Mesa 1' }],
    });
    // Ya con el CABYS general, se reemite con otro número.
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { cabysGeneral: '6331000000000' },
    });
    const id = lista.body.comprobantes[0].id;
    const r = await request(app)
      .post(`/comprobantes/${id}/reintentar`)
      .set('Authorization', `Bearer ${caja}`);
    expect(r.status).toBe(200);
    expect(r.body.comprobantes.map((c: { estado: string }) => c.estado)).toEqual([
      'PENDIENTE',
      'ERROR',
    ]);
    await prisma.comprobante.updateMany({
      where: { estado: 'PENDIENTE' },
      data: { estado: 'ACEPTADO' },
    });
    const aceptado = (await comprobantes()).find((c) => c.estado === 'ACEPTADO')!;
    expect(
      (
        await request(app)
          .post(`/comprobantes/${aceptado.id}/reintentar`)
          .set('Authorization', `Bearer ${caja}`)
      ).body.error.code,
    ).toBe('YA_ACEPTADO');
  });

  it('el dueño guarda su configuración: la llave se valida con el PIN y los secretos no se devuelven', async () => {
    const t = await dueno();
    const put = (body: object) =>
      request(app).put('/hacienda/config').set('Authorization', `Bearer ${t}`).send(body);
    const datos = {
      activa: false,
      ambiente: 'pruebas',
      tipoId: '01',
      numeroId: '123456789',
      nombre: 'Soda de Prueba',
      nombreComercial: null,
      correo: 'soda@prueba.test',
      provincia: 1,
      canton: 1,
      distrito: 1,
      otrasSenas: 'Frente al parque',
      actividad: '5610.0',
    };
    expect((await put(datos)).body.error.code).toBe('CONFIG_INCOMPLETA');
    const llaveP12 = p12.toString('base64');
    expect(
      (await put({ ...datos, usuario: 'cpf-01-2345-6789@stag', clave: 'x', llaveP12, pin: '9999' }))
        .body.error.code,
    ).toBe('LLAVE_INVALIDA');
    const ok = await put({
      ...datos,
      usuario: 'cpf-01-2345-6789@stag',
      clave: 'x',
      llaveP12,
      pin: '1234',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ tieneCredenciales: true, tieneLlave: true, activa: false });
    expect(JSON.stringify(ok.body)).not.toMatch(/stag|1234"/);
    // Activar sin volver a mandar los secretos conserva los guardados.
    expect((await put({ ...datos, activa: true })).body.activa).toBe(true);
    expect((await put({ ...datos, actividad: '5610' })).status).toBe(400);
    // La caja no puede ver ni cambiar la configuración.
    expect(
      (await request(app).get('/hacienda/config').set('Authorization', `Bearer ${caja}`)).status,
    ).toBe(403);
  });

  it('busca el nombre y las actividades de un contribuyente en Hacienda', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          nombre: 'ANA SOLIS',
          tipoIdentificacion: '01',
          actividades: [
            { estado: 'A', codigo: '5610.0', descripcion: 'Restaurantes' },
            { estado: 'I', codigo: '4711.0', descripcion: 'Inactiva' },
          ],
        }),
      ),
    );
    const r = await request(app)
      .get('/comprobantes/contribuyente?id=112340567')
      .set('Authorization', `Bearer ${caja}`);
    expect(r.body).toEqual({
      nombre: 'ANA SOLIS',
      tipoId: '01',
      actividades: [{ codigo: '5610.0', descripcion: 'Restaurantes' }],
    });
    expect(String(fetch.mock.calls[0]![0])).toContain('identificacion=112340567');
    fetch.mockRestore();
  });
});

describe('nota de crédito (Fase 15.4)', () => {
  const anular = (id: string, body: object) =>
    request(app)
      .post(`/comprobantes/${id}/anular`)
      .set('Authorization', `Bearer ${caja}`)
      .send(body);

  it('anula una factura aceptada con nota de crédito y reemite con el cliente correcto', async () => {
    await configurar();
    await cerrar({
      metodoPago: 'TARJETA',
      receptor: { tipoId: '01', numero: '112340567', nombre: 'Ana Solís' },
    });
    const [fe] = await comprobantes();
    expect((await anular(fe!.id, { razon: 'Cliente equivocado' })).body.error.code).toBe(
      'NO_ACEPTADO',
    );
    await prisma.comprobante.update({ where: { id: fe!.id }, data: { estado: 'ACEPTADO' } });
    expect((await anular(fe!.id, { razon: 'x' })).status).toBe(400);

    const r = await anular(fe!.id, {
      razon: 'Cliente equivocado',
      reemitir: true,
      receptor: { tipoId: '02', numero: '3101123456', nombre: 'Empresa Correcta S.A.' },
    });
    expect(r.status).toBe(200);
    const [, nc, nueva] = await comprobantes();
    expect(nc).toMatchObject({ tipo: 'NC', referenciaId: fe!.id, razon: 'Cliente equivocado' });
    expect(nc!.consecutivo.slice(8, 10)).toBe('03');
    expect(nc!.xmlFirmado).toContain('<NotaCreditoElectronica');
    expect(nc!.xmlFirmado).toContain(
      `<InformacionReferencia><TipoDocIR>01</TipoDocIR><Numero>${fe!.clave}</Numero>`,
    );
    expect(nc!.xmlFirmado).toContain('<Codigo>01</Codigo><Razon>Cliente equivocado</Razon>');
    expect(nc!.xmlFirmado).toContain('<Numero>112340567</Numero>'); // mismo cliente que la factura
    expect(nueva).toMatchObject({ tipo: 'FE', receptorNumero: '3101123456' });
    expect(r.body.comprobantes.find((c: { id: string }) => c.id === fe!.id).anulado).toBe(true);

    expect((await anular(fe!.id, { razon: 'Otra vez' })).body.error.code).toBe('YA_ANULADO');
    expect((await anular(nc!.id, { razon: 'Anular la nota' })).body.error.code).toBe('ES_NOTA');
  });

  it('una nota de crédito con error se vuelve a emitir como nota sobre el mismo original', async () => {
    await configurar();
    await cerrar();
    const [te] = await comprobantes();
    await prisma.comprobante.update({ where: { id: te!.id }, data: { estado: 'ACEPTADO' } });
    await anular(te!.id, { razon: 'Cobro duplicado' });
    const nc = (await comprobantes()).find((c) => c.tipo === 'NC')!;
    expect(nc.xmlFirmado).toContain('<TipoDocIR>04</TipoDocIR>'); // referencia a un tiquete
    await prisma.comprobante.update({ where: { id: nc.id }, data: { estado: 'ERROR' } });
    await request(app)
      .post(`/comprobantes/${nc.id}/reintentar`)
      .set('Authorization', `Bearer ${caja}`);
    const notas = (await comprobantes()).filter((c) => c.tipo === 'NC');
    expect(notas).toHaveLength(2);
    expect(notas[1]).toMatchObject({
      referenciaId: te!.id,
      razon: 'Cobro duplicado',
      estado: 'PENDIENTE',
    });
  });
});

describe('envío por correo y PDF (Fase 15.5)', () => {
  const aceptar = async () => {
    vi.mocked(enviar).mockResolvedValue();
    await procesarCola();
    vi.mocked(consultar).mockResolvedValue({
      estado: 'aceptado',
      mensaje: 'Aceptado',
      respuestaXml: '<MensajeHacienda>aceptado</MensajeHacienda>',
    });
    await yaToca();
    await procesarCola();
  };

  it('al aceptarse, le llega al cliente el PDF, el XML y la respuesta de Hacienda', async () => {
    correosEnviados.length = 0;
    await configurar();
    await cerrar({
      metodoPago: 'EFECTIVO',
      receptor: { tipoId: '01', numero: '112340567', nombre: 'Ana Solís', correo: 'ana@x.test' },
    });
    await aceptar();
    expect(correosEnviados).toHaveLength(1);
    const correo = correosEnviados[0]!;
    expect(correo).toMatchObject({ para: 'ana@x.test' });
    expect(correo.asunto).toMatch(/^Factura electrónica N\.º \d+ · /);
    expect(correo.adjuntos!.map((a) => a.nombre.split('.').pop())).toEqual(['pdf', 'xml', 'xml']);
    expect(correo.adjuntos![0]!.contenido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(correo.adjuntos![2]!.nombre).toMatch(/respuesta-hacienda\.xml$/);
    const [c] = await comprobantes();
    expect(c!.correoEnviadoEn).not.toBeNull();
    // No se vuelve a mandar en la siguiente vuelta de la cola.
    await yaToca();
    await procesarCola();
    expect(correosEnviados).toHaveLength(1);
  });

  it('sin correo no se envía; la caja puede enviarlo a otro correo y descargar el PDF', async () => {
    correosEnviados.length = 0;
    await configurar();
    await cerrar();
    const [te] = await comprobantes();
    const enviarA = (body: object) =>
      request(app)
        .post(`/comprobantes/${te!.id}/enviar`)
        .set('Authorization', `Bearer ${caja}`)
        .send(body);
    expect((await enviarA({ correo: 'x@y.test' })).body.error.code).toBe('NO_ACEPTADO');
    await aceptar();
    expect(correosEnviados).toHaveLength(0);
    expect((await enviarA({})).body.error.code).toBe('SIN_CORREO');
    const r = await enviarA({ correo: 'cliente@correo.test' });
    expect(r.status).toBe(200);
    expect(correosEnviados[0]).toMatchObject({ para: 'cliente@correo.test' });
    expect(r.body.comprobantes[0]).toMatchObject({ correoPara: 'cliente@correo.test' });

    const pdf = await request(app)
      .get(`/comprobantes/${te!.id}/pdf`)
      .set('Authorization', `Bearer ${caja}`)
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (b: Buffer) => partes.push(b));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const xml = await request(app)
      .get(`/comprobantes/${te!.id}/xml`)
      .set('Authorization', `Bearer ${caja}`);
    expect(xml.text).toContain('<TiqueteElectronico');
  });
});

describe('nota de crédito parcial (Fase 17.2)', () => {
  const post = (ruta: string, body: object) =>
    request(app).post(ruta).set('Authorization', `Bearer ${caja}`).send(body);
  const aceptado = async () => {
    await configurar();
    await cerrar({ metodoPago: 'EFECTIVO' });
    const [te] = await comprobantes();
    await prisma.comprobante.update({ where: { id: te!.id }, data: { estado: 'ACEPTADO' } });
    return te!;
  };

  it('acredita solo las unidades elegidas, con su parte del servicio, y no deja pasarse', async () => {
    const te = await aceptado();
    const lineas = await request(app)
      .get(`/comprobantes/${te.id}/lineas`)
      .set('Authorization', `Bearer ${caja}`);
    expect(
      lineas.body.map((l: { detalle: string; disponible: number }) => [l.detalle, l.disponible]),
    ).toEqual([
      ['Casado (Medio)', 1],
      ['Refresco', 2],
    ]);

    const r = await post(`/comprobantes/${te.id}/nota-parcial`, {
      razon: 'Devolvió un refresco',
      tipo: 'devolucion',
      lineas: [{ indice: 2, cantidad: 1 }],
    });
    expect(r.status).toBe(200);
    const nc = (await comprobantes()).find((c) => c.tipo === 'NC')!;
    expect(nc).toMatchObject({
      referenciaId: te.id,
      lineasNota: { codigo: '06', lineas: [{ indice: 2, cantidad: 1 }] },
    });
    expect(nc.xmlFirmado).toContain('<Detalle>Refresco</Detalle>');
    expect(nc.xmlFirmado).not.toContain('Casado');
    expect(nc.xmlFirmado).toContain('<Cantidad>1.000</Cantidad>');
    expect(nc.xmlFirmado).toContain('<Codigo>06</Codigo><Razon>Devolvió un refresco</Razon>');
    expect(nc.xmlFirmado).toContain('<TipoDocumentoOC>06</TipoDocumentoOC>'); // su parte del 10 %
    // Hacienda exige el medio de pago también en la nota (se probó en el ambiente de pruebas).
    expect(nc.xmlFirmado).toContain('<MedioPago><TipoMedioPago>01</TipoMedioPago>');
    expect(nc.total).toBeGreaterThan(150000); // el refresco con IVA más su servicio
    expect(nc.total).toBeLessThan(te.total);
    expect(r.body.comprobantes.find((c: { id: string }) => c.id === te.id)).toMatchObject({
      anulado: false,
      notasParciales: 1,
    });

    // Queda 1 refresco: pedir 2 se rechaza; la anulación total se bloquea.
    const demas = await post(`/comprobantes/${te.id}/nota-parcial`, {
      razon: 'Otro refresco',
      tipo: 'error',
      lineas: [{ indice: 2, cantidad: 2 }],
    });
    expect(demas.body.error).toMatchObject({
      code: 'EXCEDE',
      message: expect.stringContaining('solo quedan 1'),
    });
    expect(
      (await post(`/comprobantes/${te.id}/anular`, { razon: 'Anular todo' })).body.error.code,
    ).toBe('TIENE_PARCIALES');
    expect(
      (await post(`/comprobantes/${te.id}/nota-parcial`, { razon: 'x', tipo: 'error', lineas: [] }))
        .status,
    ).toBe(400);
  });

  it('un comprobante anulado no admite parciales; una parcial con error se reemite igual', async () => {
    const te = await aceptado();
    await post(`/comprobantes/${te.id}/nota-parcial`, {
      razon: 'Se cobró de más',
      tipo: 'error',
      lineas: [{ indice: 1, cantidad: 1 }],
    });
    const nc = (await comprobantes()).find((c) => c.tipo === 'NC')!;
    expect(nc.xmlFirmado).toContain('<Codigo>14</Codigo>');
    await prisma.comprobante.update({ where: { id: nc.id }, data: { estado: 'ERROR' } });
    await post(`/comprobantes/${nc.id}/reintentar`, {});
    const notas = (await comprobantes()).filter((c) => c.tipo === 'NC');
    expect(notas).toHaveLength(2);
    expect(notas[1]).toMatchObject({
      lineasNota: { codigo: '14', lineas: [{ indice: 1, cantidad: 1 }] },
    });

    // Otro cobro, anulado por completo: ya no queda nada por acreditar.
    await prisma.comprobante.deleteMany({ where: { tipo: 'NC' } });
    await post(`/comprobantes/${te.id}/anular`, { razon: 'Anular todo' });
    const r = await post(`/comprobantes/${te.id}/nota-parcial`, {
      razon: 'Devolución',
      tipo: 'devolucion',
      lineas: [{ indice: 2, cantidad: 1 }],
    });
    expect(r.body.error).toMatchObject({
      code: 'EXCEDE',
      message: expect.stringContaining('por completo'),
    });
  });
});
