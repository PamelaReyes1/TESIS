'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  analizarImagenRemota,
  validarRespuestaIA,
  mapearClaseBD,
  detectarMime,
  InferenceError,
} = require('../services/inferenceClient');

const respuesta = (clase, estado = 'aceptada', confianza = 95) => ({
  modelo: 'ResNet50',
  clase_propuesta: clase,
  diagnostico: estado === 'aceptada' ? clase : 'Revision manual',
  estado_decision: estado,
  motivos_revision: estado === 'revision_manual' ? ['confianza_insuficiente'] : [],
  confianza_pct: confianza,
  margen_pct: 70,
  probabilidades_pct: {'Sano': 3, 'Pudricion leve': 95, 'Pudricion Alta': 2},
  verificacion_cv: {estado: 'sin_referencias'},
});

test('mapeo de clases reales (sin inventar indice de afectacion)', () => {
  assert.equal(mapearClaseBD('Sano'), 'Sana');
  assert.equal(mapearClaseBD('Pudrición leve'), 'Con deterioro');
  assert.equal(mapearClaseBD('Pudricion Alta'), 'Podrida');
  assert.throws(() => mapearClaseBD('incognita'), InferenceError);
});

test('no asigna estado definitivo a Revision manual', () => {
  const resultado = validarRespuestaIA(respuesta('Pudricion leve', 'revision_manual', 64.1));
  assert.equal(resultado.resultadoBD, null);
  assert.equal(resultado.claseBDPropuesta, 'Con deterioro');
  assert.equal(resultado.estadoDecision, 'revision_manual');
  assert.equal(resultado.confianza, 64.1);
});

test('detecta formatos validos por firma, no solo extension', () => {
  assert.equal(detectarMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectarMime(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.throws(() => detectarMime(Buffer.from('<html>no</html>')), /imagen compatible/);
});

test('envia multipart al endpoint FastAPI y mapea la respuesta', async () => {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'uvas-infer-'));
  const imagen = path.join(carpeta, 'prueba.jpg');
  const prevKey = process.env.INFERENCE_API_KEY;
  const prevUrl = process.env.INFERENCE_API_URL;
  try {
    await fs.writeFile(imagen, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]));
    process.env.INFERENCE_API_KEY = 'clave-unica-de-pruebas';
    process.env.INFERENCE_API_URL = 'https://servicio-ia-uvas.onrender.com';
    let called = false;
    const resultado = await analizarImagenRemota(imagen, {
      fetchImpl: async (url, options) => {
        called = true;
        assert.equal(url, 'https://servicio-ia-uvas.onrender.com/api/v1/predict');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['X-API-Key'], 'clave-unica-de-pruebas');
        assert.equal(options.body.get('file').type, 'image/jpeg');
        assert.equal(options.body.get('file').name, 'prueba.jpg');
        return new Response(JSON.stringify(respuesta('Pudricion Alta')), {
          status: 200, headers: {'Content-Type': 'application/json'},
        });
      },
    });
    assert.equal(called, true);
    assert.equal(resultado.resultadoBD, 'Podrida');
    assert.equal(resultado.modelo, 'ResNet50');
    assert.equal(resultado.confianza, 95);
  } finally {
    if (prevKey === undefined) delete process.env.INFERENCE_API_KEY;
    else process.env.INFERENCE_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.INFERENCE_API_URL;
    else process.env.INFERENCE_API_URL = prevUrl;
    await fs.rm(carpeta, {recursive: true, force: true});
  }
});

test('error de autenticacion upstream no expone secretos', async () => {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'uvas-infer-'));
  const imagen = path.join(carpeta, 'prueba.jpg');
  const prevKey = process.env.INFERENCE_API_KEY;
  try {
    await fs.writeFile(imagen, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    process.env.INFERENCE_API_KEY = 'clave-interna-secreta';
    await assert.rejects(
      () => analizarImagenRemota(imagen, {
        fetchImpl: async () => new Response('no authorization', {status: 401}),
      }),
      (err) => err.code === 'UPSTREAM_AUTH_FAILED'
        && err.statusCode === 502
        && !err.message.includes('clave-interna-secreta')
    );
  } finally {
    if (prevKey === undefined) delete process.env.INFERENCE_API_KEY;
    else process.env.INFERENCE_API_KEY = prevKey;
    await fs.rm(carpeta, {recursive: true, force: true});
  }
});

test('modelo FastAPI invalido se rechaza, no se guarda un estado falso', () => {
  assert.throws(
    () => validarRespuestaIA({ ...respuesta('Sano'), estado_decision: 'otro' }),
    /estado de decisión desconocido/
  );
  assert.throws(
    () => validarRespuestaIA({ ...respuesta('Sano'), confianza_pct: "invalida" }),
    /confianza inválida|confianza/
  );
});
