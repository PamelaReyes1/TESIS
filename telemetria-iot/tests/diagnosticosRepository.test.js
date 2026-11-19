'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { guardarDiagnostico, normalizarHistorial } = require('../services/diagnosticosRepository');

function crearPoolSimulado({ falloEnAnalisis = false } = {}) {
  const operaciones = [];
  const conexion = {
    beginTransaction: async () => operaciones.push('begin'),
    query: async sql => {
      operaciones.push(sql.trim());
      if (sql.includes('FROM mediciones')) return [[]];
      throw new Error('Consulta desconocida');
    },
    execute: async (sql, values) => {
      operaciones.push({ sql: sql.trim(), values });
      if (sql.includes('INSERT INTO imagenes')) return [{ insertId: 24 }];
      if (sql.includes('UPDATE imagenes')) return [{ affectedRows: 1 }];
      if (sql.includes('INSERT INTO analisis_imagen')) {
        if (falloEnAnalisis) throw new Error('Inserción de análisis fallida');
        return [{ insertId: 25 }];
      }
      throw new Error('SQL inesperado');
    },
    commit: async () => operaciones.push('commit'),
    rollback: async () => operaciones.push('rollback'),
    release: () => operaciones.push('release'),
  };
  return { pool: {promise: () => ({getConnection: async () => conexion})}, operaciones };
}

const bytes = Buffer.from([255,216,255,1,2,3]);
const baseIA = {
  estadoDecision: 'revision_manual', resultadoBD: null, clasePropuesta: 'Sano',
  confianza: 50.24, modelo: 'EfficientNetB0',
  motivosRevision: ['confianza_insuficiente'], probabilidadesPct: {'Sano': 50.24},
};

test('sin sensores: guarda fotografía binaria y revisión manual en una transacción', async () => {
  const { pool, operaciones } = crearPoolSimulado();
  const resultado = await guardarDiagnostico(pool, {
    bytes, mime: 'image/jpeg', resultadoIA: baseIA,
  });
  assert.equal(resultado.id_imagen, 24);
  assert.equal(resultado.ruta, '/imagenes/db/24');
  assert.equal(resultado.id_medicion, null);
  assert.equal(resultado.riesgo, null);
  assert.deepEqual(operaciones.filter(x => typeof x === 'string'), ['begin', 'commit', 'release']);
  const inserts = operaciones.filter(x => typeof x === 'object');
  assert.equal(inserts.length, 3);
  assert.deepEqual(inserts[0].values, [null, '/imagenes/db/pendiente', null, bytes, 'image/jpeg']);
  assert.equal(inserts[2].values[2], null); // sin diagnóstico definitivo
  assert.equal(inserts[2].values[5], 'revision_manual');
  assert.equal(inserts[2].values[6], 'Sano');
});

test('sin sensores: guarda clasificación aceptada pero riesgo ambiental queda nulo', async () => {
  const { pool, operaciones } = crearPoolSimulado();
  const resultado = await guardarDiagnostico(pool, {
    bytes, mime: 'image/jpeg',
    resultadoIA: {...baseIA, estadoDecision: 'aceptada', resultadoBD: 'Sana', confianza: 98},
  });
  assert.equal(resultado.riesgo, null);
  const analisis = operaciones.find(x => typeof x === 'object' && x.sql.includes('INSERT INTO analisis_imagen'));
  assert.equal(analisis.values[2], 'Sana');
  assert.equal(analisis.values[5], 'aceptada');
});

test('no deja fotografía huérfana si falla guardar el análisis', async () => {
  const { pool, operaciones } = crearPoolSimulado({falloEnAnalisis: true});
  await assert.rejects(() => guardarDiagnostico(pool, {bytes, mime:'image/jpeg', resultadoIA:baseIA}), /fallida/);
  assert.ok(operaciones.includes('rollback'));
  assert.ok(!operaciones.includes('commit'));
  assert.equal(operaciones.at(-1), 'release');
});

test('historial muestra revisión y clase propuesta sin inventar diagnóstico ni riesgo', () => {
  const fila = normalizarHistorial({
    id_imagen: 24, estado_decision:'revision_manual', resultado:null,
    estado_uva:null, confianza: 50.24, riesgo:null,
    clase_propuesta:'Sano', motivos_revision:'["confianza_insuficiente"]',
    probabilidades_json:'{"Sano":50.24}'
  });
  assert.equal(fila.resultado, 'Revision manual');
  assert.equal(fila.riesgo, null);
  assert.equal(fila.clase_propuesta, 'Sano');
  assert.deepEqual(fila.motivos_revision, ['confianza_insuficiente']);
  assert.equal(fila.probabilidades_pct.Sano, 50.24);
});
