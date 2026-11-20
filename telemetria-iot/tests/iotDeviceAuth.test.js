'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const CLAVE_SENSOR = 'n'.repeat(48);
const CLAVE_CAMARA = 'c'.repeat(48);

function cargarServidorParaPruebas() {
  const rutas = new Map();
  const inserciones = [];
  const app = {
    get: (ruta, ...handlers) => rutas.set(`GET ${ruta}`, handlers),
    post: (ruta, ...handlers) => rutas.set(`POST ${ruta}`, handlers),
    use: () => {},
    listen: () => ({ on: () => {} }),
  };
  const express = () => app;
  express.json = () => (_req, _res, next) => next();
  express.raw = () => (_req, _res, next) => next();
  express.static = () => (_req, _res, next) => next();
  const multer = () => ({ single: () => (_req, _res, next) => next() });
  multer.diskStorage = () => ({});
  multer.MulterError = class MulterError extends Error {};
  const db = {
    query(sql, params, callback) {
      if (typeof params === 'function') callback = params;
      if (sql.includes('INSERT INTO mediciones')) {
        inserciones.push(params);
        return callback(null, { insertId: 77 });
      }
      return callback(null, []);
    },
  };
  const deps = {
    express,
    mysql2: {},
    cors: () => (_req, _res, next) => next(),
    multer,
    axios: {},
    dotenv: { config: () => {} },
    './db': db,
    './services/inferenceClient': {
      detectarMime: () => 'image/jpeg',
      analizarImagenRemota: async () => ({}),
      detallesPublicosIA: () => ({}),
      respuestaRevisionManual: () => ({}),
      estadoErrorInferencia: () => 502,
    },
    './services/diagnosticosRepository': {
      guardarDiagnostico: async () => ({}),
      normalizarHistorial: x => x,
    },
  };
  const modulePath = path.resolve(__dirname, '../server.js');
  const original = Module._load;
  Module._load = function(id, parent, main) {
    if (parent && parent.filename === modulePath && Object.hasOwn(deps, id)) {
      return deps[id];
    }
    return original.call(this, id, parent, main);
  };
  try {
    delete require.cache[modulePath];
    require(modulePath);
  } finally {
    Module._load = original;
    delete require.cache[modulePath];
  }
  return { rutas, inserciones };
}

function invocar(handlers, { headers = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      body,
      get: name => headers[name.toLowerCase()] || '',
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { resolve({ status: this.statusCode, body: value }); return this; },
      send(value) { resolve({ status: this.statusCode, body: value }); return this; },
    };
    function siguiente(i) {
      if (i >= handlers.length) return reject(new Error('La ruta no respondió'));
      try {
        Promise.resolve(handlers[i](req, res, () => siguiente(i + 1))).catch(reject);
      } catch (e) { reject(e); }
    }
    siguiente(0);
  });
}

test('mediciones: sin clave -> HTTP 401; con clave válida -> HTTP 200 y SQL', async () => {
  process.env.IOT_NODEMCU_KEY = CLAVE_SENSOR;
  process.env.IOT_CAMARA_KEY = CLAVE_CAMARA;
  const { rutas, inserciones } = cargarServidorParaPruebas();
  const post = rutas.get('POST /mediciones');
  assert.ok(post);
  const payload = { id_sensor: 1, temperatura: 26.5, humedad: 72.3 };
  const sinClave = await invocar(post, { body: payload });
  assert.equal(sinClave.status, 401);
  assert.equal(inserciones.length, 0);
  const correcta = await invocar(post, {
    headers: { 'x-device-key': CLAVE_SENSOR }, body: payload,
  });
  assert.equal(correcta.status, 200);
  assert.equal(correcta.body.id, 77);
  assert.deepEqual(inserciones, [[1, 26.5, 72.3]]);
});

test('mediciones: rechaza valores invalidos y conserva GET', async () => {
  process.env.IOT_NODEMCU_KEY = CLAVE_SENSOR;
  const { rutas, inserciones } = cargarServidorParaPruebas();
  const invalido = await invocar(rutas.get('POST /mediciones'), {
    headers: { 'x-device-key': CLAVE_SENSOR },
    body: { id_sensor: 1, temperatura: 20, humedad: 110 },
  });
  assert.equal(invalido.status, 400);
  assert.equal(inserciones.length, 0);
  assert.ok(rutas.has('GET /mediciones'));
});

test('camara: distinta clave, JPEG sin credencial -> HTTP 401', async () => {
  process.env.IOT_NODEMCU_KEY = CLAVE_SENSOR;
  process.env.IOT_CAMARA_KEY = CLAVE_CAMARA;
  const { rutas } = cargarServidorParaPruebas();
  const post = rutas.get('POST /imagenes-directa');
  assert.ok(post);
  assert.equal((await invocar(post, { headers: { 'x-device-key': CLAVE_SENSOR } })).status, 401);
  // Con clave correcta, pasa la autenticacion y valida los bytes JPEG.
  assert.equal((await invocar(post, { headers: { 'x-device-key': CLAVE_CAMARA } })).status, 400);
  assert.ok(rutas.has('POST /imagenes-subir')); // no se afecta la carga desde Ionic
});

test('sin secretos configurados: acceso IoT denegado (HTTP 503)', async () => {
  delete process.env.IOT_NODEMCU_KEY;
  delete process.env.IOT_CAMARA_KEY;
  const { rutas } = cargarServidorParaPruebas();
  const status = await invocar(rutas.get('POST /mediciones'));
  assert.equal(status.status, 503);
});
