'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function prepararServidorSimulado(resultadoRemoto) {
  const routes = new Map();
  const queries = [];
  const app = {
    get: (ruta, ...h) => routes.set(`GET ${ruta}`, h.at(-1)),
    post: (ruta, ...h) => routes.set(`POST ${ruta}`, h.at(-1)),
    use: () => {},
    listen: () => ({ on: () => {} }),
  };
  const express = () => app;
  express.json = () => (_req, _res, next) => next();
  express.raw = () => (_req, _res, next) => next();
  express.static = () => (_req, _res, next) => next();
  const multer = () => ({single: () => (_req, _res, next) => next()});
  multer.diskStorage = () => ({});
  multer.MulterError = class MulterError extends Error {};
  const db = {
    query: (sql, params, callback) => {
      if (typeof params === 'function') callback = params;
      queries.push(sql.trim());
      if (/FROM mediciones/.test(sql)) return callback(null, [{id_medicion: 7, temperatura: 23, humedad: 62}]);
      if (/INSERT INTO imagenes/.test(sql)) return callback(null, {insertId: 12});
      if (/INSERT INTO analisis_imagen/.test(sql)) return callback(null, {insertId: 15});
      throw new Error('Consulta inesperada en test: ' + sql);
    },
  };
  const dependencies = {
    express, mysql2: {}, cors: () => (_req, _res, next) => next(),
    multer, axios: {get: async () => ({data: Buffer.from('image')})},
    dotenv: {config: () => {}}, './db': db,
    './services/inferenceClient': {
      analizarImagenRemota: async () => resultadoRemoto,
      detallesPublicosIA: resultado => ({
        clase_propuesta: resultado.clasePropuesta,
        estado_decision: resultado.estadoDecision,
      }),
      respuestaRevisionManual: resultado => ({
        mensaje: 'Revisión manual', estado_uva: null,
        resultado: null, persistido: false,
        clase_propuesta: resultado.clasePropuesta,
      }),
      estadoErrorInferencia: error => error.statusCode || 502,
    },
  };
  const modPath = path.resolve(__dirname, '../server.js');
  const originalLoad = Module._load;
  Module._load = function (id, parent, main) {
    if (parent && parent.filename === modPath && Object.prototype.hasOwnProperty.call(dependencies, id)) {
      return dependencies[id];
    }
    return originalLoad.call(this, id, parent, main);
  };
  try {
    delete require.cache[modPath];
    require(modPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modPath];
  }
  return {routes, queries};
}

async function invocar(handler) {
  return new Promise((resolve, reject) => {
    const req = {file: {filename: 'imagen-prueba.jpg', path: '/tmp/imagen-prueba.jpg'}};
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({status: this.statusCode, body}); return this; },
      send(body) { resolve({status: this.statusCode, body}); return this; },
    };
    try { handler(req, res); } catch (e) { reject(e); }
  });
}

test('imagenes-subir: revisión manual devuelve 202 sin escribir en MySQL', async () => {
  const {routes, queries} = prepararServidorSimulado({
    estadoDecision: 'revision_manual', clasePropuesta: 'Pudricion leve',
    resultadoBD: null, confianza: 62, modelo: 'ResNet50',
  });
  assert.ok(routes.has('POST /imagenes-subir'));
  assert.ok(routes.has('POST /imagenes-directa'));
  assert.ok(routes.has('POST /inferencia'));
  assert.ok(routes.has('POST /capturar-esp32'));
  const respuesta = await invocar(routes.get('POST /imagenes-subir'));
  assert.equal(respuesta.status, 202);
  assert.equal(respuesta.body.persistido, false);
  assert.equal(respuesta.body.resultado, null);
  assert.equal(queries.length, 0);
});

test('imagenes-subir: clasificacion aceptada conserva inserciones y modelo real', async () => {
  const {routes, queries} = prepararServidorSimulado({
    estadoDecision: 'aceptada', clasePropuesta: 'Sano',
    resultadoBD: 'Sana', confianza: 89.3, modelo: 'MobileNetV2',
  });
  const respuesta = await invocar(routes.get('POST /imagenes-subir'));
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.body.id_imagen, 12);
  assert.equal(respuesta.body.resultado, 'Sana');
  assert.equal(respuesta.body.modelo, 'MobileNetV2');
  assert.equal(respuesta.body.confianza, 89.3);
  assert.equal(respuesta.body.persistido, true);
  assert.equal(queries.length, 3);
});
