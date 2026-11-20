'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const KEY = 'c'.repeat(48);
const ORIGIN = 'https://tesis-pamela.onrender.com';

function iniciarPrueba() {
  process.env.IOT_CAMARA_KEY = KEY;
  process.env.IOT_NODEMCU_KEY = 'n'.repeat(48);
  process.env.FRONTEND_ORIGIN = ORIGIN;
  const rutas = new Map();
  const app = {
    get: (ruta, ...fn) => rutas.set(`GET ${ruta}`, fn),
    post: (ruta, ...fn) => rutas.set(`POST ${ruta}`, fn),
    use: () => {}, listen: () => ({ on: () => {} })
  };
  const express = () => app;
  express.json = () => () => {};
  express.raw = () => (_req, _res, next) => next();
  express.static = () => () => {};
  const multer = () => ({ single: () => () => {} });
  multer.diskStorage = () => ({});
  multer.MulterError = class extends Error {};
  let orden = null;
  const db = {
    query: (_sql, callback) => callback(null, []),
    promise() { return { query: async (sql, params = []) => {
      if (sql.includes('SET estado = \'expirada\'')) return [{ affectedRows: 0 }];
      if (sql.includes('INSERT INTO ordenes_captura_esp32')) {
        if (orden && orden.active_slot === 1) {
          const error = new Error('Duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error;
        }
        orden = { id_orden: 1, estado: 'pendiente', id_imagen: null, mensaje_error: null, active_slot: 1 };
        return [{ insertId: orden.id_orden }];
      }
      if (sql.includes('SET estado = \'procesando\'')) {
        if (orden && orden.estado === 'pendiente') {
          orden.estado = 'procesando';
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('SET estado = \'recibida\'')) {
        if (orden && orden.estado === 'procesando' && orden.id_orden === params[0]) {
          orden.estado = 'recibida';
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('SET estado = \'completada\'')) {
        orden.estado = 'completada'; orden.id_imagen = params[0]; orden.active_slot = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SET estado = \'fallida\'')) {
        orden.estado = 'fallida'; orden.active_slot = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT id_orden, estado, id_imagen')) return [[orden].filter(Boolean)];
      if (sql.includes('SELECT id_orden FROM ordenes_captura_esp32'))
        return [[orden].filter(o => o.estado === 'procesando')];
      throw new Error(`SQL no simulado: ${sql}`);
    } }; }
  };
  const deps = {
    express, mysql2: {}, cors: () => () => {}, multer,
    dotenv: { config: () => {} }, './db': db,
    './services/inferenceClient': {
      detectarMime: () => 'image/jpeg',
      analizarImagenRemota: async () => ({ estadoDecision: 'revision_manual', modelo: 'EfficientNetB0', confianza: 50 }),
      detallesPublicosIA: () => ({}),
      respuestaRevisionManual: () => ({}), estadoErrorInferencia: () => 502
    },
    './services/diagnosticosRepository': {
      guardarDiagnostico: async () => ({ id_imagen: 42, id_analisis: 99, id_medicion: null, ruta: '/imagenes/db/42', riesgo: null }),
      normalizarHistorial: x => x
    },
  };
  const target = path.resolve(__dirname, '../server.js');
  const old = Module._load;
  Module._load = function(id, parent, isMain) {
    if (parent?.filename === target && Object.hasOwn(deps, id)) return deps[id];
    return old.call(this, id, parent, isMain);
  };
  try { delete require.cache[target]; require(target); }
  finally { Module._load = old; delete require.cache[target]; }
  return { rutas, getOrden: () => orden };
}

function llamar(handlers, { body = {}, headers = {}, params = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { body, params, get: name => headers[name.toLowerCase()] || '' };
    const res = {
      statusCode: 200,
      status(n) { this.statusCode = n; return this; },
      json(val) { resolve({ status: this.statusCode, body: val }); return this; },
      send(val) { resolve({ status: this.statusCode, body: val }); return this; },
      set() { return this; },
      type() { return this; },
    };
    const next = index => {
      if (index >= handlers.length) return reject(new Error('Ruta sin respuesta'));
      try { Promise.resolve(handlers[index](req, res, () => next(index + 1))).catch(reject); }
      catch (error) { reject(error); }
    };
    next(0);
  });
}

test('Solo una orden desde origen del front; sin foto automatica; cámara consume y sube una vez', async () => {
  const { rutas, getOrden } = iniciarPrueba();
  const crear = rutas.get('POST /capturar-esp32');
  assert.ok(crear);
  assert.equal((await llamar(crear)).status, 403); // no origen
  const primera = await llamar(crear, { headers: { origin: ORIGIN } });
  assert.equal(primera.status, 202);
  assert.equal(primera.body.id_orden, 1);
  assert.equal((await llamar(crear, { headers: { origin: ORIGIN } })).status, 409);
  assert.equal(getOrden().estado, 'pendiente');

  const poll = rutas.get('GET /esp32/orden-pendiente');
  assert.equal((await llamar(poll)).status, 401);
  const orden = await llamar(poll, { headers: { 'x-device-key': KEY } });
  assert.equal(orden.body, '1');
  assert.equal(getOrden().estado, 'procesando');
  assert.equal((await llamar(poll, { headers: { 'x-device-key': KEY } })).body, '0');

  const subir = rutas.get('POST /imagenes-directa');
  assert.equal((await llamar(subir, { headers: { 'x-device-key': KEY }, body: Buffer.from([0xff,0xd8]) })).status, 400);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const respuesta = await llamar(subir, {
    headers: { 'x-device-key': KEY, 'x-capture-id': '1' }, body: jpeg
  });
  assert.equal(respuesta.status, 202);
  assert.equal(respuesta.body.id_imagen, 42);
  assert.equal(getOrden().estado, 'completada');
  assert.equal(getOrden().active_slot, null);
  const estado = await llamar(rutas.get('GET /capturar-esp32/estado/:id'), { params: { id: '1' } });
  assert.equal(estado.body.estado, 'completada');
  assert.equal(estado.body.id_imagen, 42);
  assert.equal((await llamar(subir, { headers: { 'x-device-key': KEY, 'x-capture-id': '1' }, body: jpeg })).status, 409);
});
