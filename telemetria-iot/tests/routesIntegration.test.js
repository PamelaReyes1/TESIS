'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

function prepararServidorSimulado(resultadoIA) {
  const routes = new Map();
  const guardados = [];
  const app = {
    get: (ruta, ...handlers) => routes.set(`GET ${ruta}`, handlers.at(-1)),
    post: (ruta, ...handlers) => routes.set(`POST ${ruta}`, handlers.at(-1)),
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
    query: (sql, params, callback) => {
      if (typeof params === 'function') callback = params;
      if (sql.includes('FROM imagenes i')) return callback(null, []);
      if (sql.includes('SELECT contenido, tipo_mime')) return callback(null, []);
      return callback(null, []);
    },
  };
  const deps = {
    express,
    mysql2: {},
    cors: () => (_req, _res, next) => next(),
    multer,
    axios: { get: async () => ({ data: Buffer.from([255,216,255]) }) },
    dotenv: { config: () => {} },
    './db': db,
    './services/inferenceClient': {
      analizarImagenRemota: async () => resultadoIA,
      detectarMime: () => 'image/jpeg',
      detallesPublicosIA: resultado => ({
        clase_propuesta: resultado.clasePropuesta,
        estado_decision: resultado.estadoDecision,
      }),
      respuestaRevisionManual: () => ({}),
      estadoErrorInferencia: error => error.statusCode || 502,
    },
    './services/diagnosticosRepository': {
      guardarDiagnostico: async (_db, payload) => {
        guardados.push(payload);
        return { id_imagen: 12, id_analisis: 13, id_medicion: null, ruta: '/imagenes/db/12', riesgo: null, temperatura: null, humedad: null };
      },
      normalizarHistorial: fila => fila,
    },
  };
  const modPath = path.resolve(__dirname, '../server.js');
  const originalLoad = Module._load;
  Module._load = function (id, parent, main) {
    if (parent && parent.filename === modPath && Object.prototype.hasOwnProperty.call(deps, id)) {
      return deps[id];
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
  return { routes, guardados };
}

function invocar(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status:this.statusCode, body }); return this; },
      send(body) { resolve({ status:this.statusCode, body }); return this; },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const ia = {
  estadoDecision:'revision_manual', clasePropuesta:'Sano', resultadoBD:null,
  confianza:50.24, modelo:'EfficientNetB0',
};

test('upload revisable: HTTP 202 pero sí guarda imagen+análisis sin sensor', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'uvas-test-'));
  const filename = path.join(folder, 'imagen.jpg');
  try {
    await fs.writeFile(filename, Buffer.from([255,216,255,12]));
    const { routes, guardados } = prepararServidorSimulado(ia);
    assert.ok(routes.has('POST /imagenes-subir'));
    assert.ok(routes.has('GET /imagenes'));
    assert.ok(routes.has('GET /imagenes/db/:id'));
    const result = await invocar(routes.get('POST /imagenes-subir'), {
      file:{filename:'imagen.jpg',path:filename}
    });
    assert.equal(result.status, 202);
    assert.equal(result.body.persistido, true);
    assert.equal(result.body.id_imagen, 12);
    assert.equal(result.body.ruta, '/imagenes/db/12');
    assert.equal(result.body.estado_decision, 'revision_manual');
    assert.equal(result.body.resultado, null);
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].resultadoIA.estadoDecision, 'revision_manual');
    await assert.rejects(fs.stat(filename), /ENOENT/); // borrada del disco
  } finally {
    await fs.rm(folder, {recursive:true,force:true});
  }
});

test('upload aceptado: HTTP 201 y fotografía persistida sin datos de sensores', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'uvas-test-'));
  const filename = path.join(folder, 'imagen.jpg');
  try {
    await fs.writeFile(filename, Buffer.from([255,216,255,12]));
    const { routes } = prepararServidorSimulado({...ia, estadoDecision:'aceptada', resultadoBD:'Sana'});
    const result = await invocar(routes.get('POST /imagenes-subir'), {
      file:{filename:'imagen.jpg',path:filename}
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.resultado, 'Sana');
    assert.equal(result.body.id_medicion, null);
    assert.equal(result.body.persistido, true);
  } finally {
    await fs.rm(folder, {recursive:true,force:true});
  }
});
