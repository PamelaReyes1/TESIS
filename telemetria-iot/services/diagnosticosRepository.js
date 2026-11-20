'use strict';

/**
 * Persistencia atómica de fotografía original y análisis. No exige sensores.
 * La fotografía vive en MariaDB (LONGBLOB), no en el disco efímero de Render.
 */
async function guardarDiagnostico(pool, { bytes, mime, resultadoIA, calcularRiesgo, asociarMedicion = false }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('Fotografía vacía');
  if (!resultadoIA || !['aceptada', 'revision_manual'].includes(resultadoIA.estadoDecision)) {
    throw new Error('Resultado de IA no válido');
  }
  const revision = resultadoIA.estadoDecision === 'revision_manual';
  const conexion = await pool.promise().getConnection();
  let transaccion = false;
  try {
    await conexion.beginTransaction();
    transaccion = true;

    let idMedicion = null;
    let temperatura = null;
    let humedad = null;
    let riesgo = null;
    // Solo asociar una medición REAL cuando se active expresamente esta opción.
    if (asociarMedicion) {
      const [mediciones] = await conexion.query(`
        SELECT id_medicion, temperatura, humedad
        FROM mediciones ORDER BY fecha_hora DESC LIMIT 1
      `);
      if (mediciones.length) {
        const medicion = mediciones[0];
        const t = Number(medicion.temperatura);
        const h = Number(medicion.humedad);
        if (Number.isFinite(t) && Number.isFinite(h) && medicion.temperatura != null && medicion.humedad != null) {
          idMedicion = medicion.id_medicion;
          temperatura = t;
          humedad = h;
          riesgo = revision
            ? null
            : calcularRiesgo(t, h, resultadoIA.resultadoBD);
        }
      }
    }

    const estado = revision ? null : resultadoIA.resultadoBD;
    const [imagen] = await conexion.execute(`
      INSERT INTO imagenes
        (id_medicion, ruta_imagen, estado_uva, contenido, tipo_mime)
      VALUES (?, ?, ?, ?, ?)
    `, [idMedicion, '/imagenes/db/pendiente', estado, bytes, mime]);
    const idImagen = imagen.insertId;
    const rutaImagen = `/imagenes/db/${idImagen}`;
    await conexion.execute('UPDATE imagenes SET ruta_imagen = ? WHERE id_imagen = ?', [rutaImagen, idImagen]);

    const [analisis] = await conexion.execute(`
      INSERT INTO analisis_imagen
        (id_imagen, modelo_cnn, resultado, confianza, riesgo,
         estado_decision, clase_propuesta, motivos_revision, probabilidades_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      idImagen,
      resultadoIA.modelo,
      estado,
      resultadoIA.confianza,
      riesgo,
      resultadoIA.estadoDecision,
      resultadoIA.clasePropuesta,
      JSON.stringify(resultadoIA.motivosRevision || []),
      JSON.stringify(resultadoIA.probabilidadesPct || {}),
    ]);

    await conexion.commit();
    transaccion = false;
    return {
      id_imagen: idImagen,
      id_analisis: analisis.insertId,
      id_medicion: idMedicion,
      ruta: rutaImagen,
      riesgo,
      temperatura,
      humedad,
    };
  } catch (error) {
    if (transaccion) {
      try { await conexion.rollback(); } catch (rollbackError) {
        console.error('No fue posible revertir transacción:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    conexion.release();
  }
}

function parsearJson(valor, predeterminado) {
  if (valor == null) return predeterminado;
  if (typeof valor === 'object' && !Buffer.isBuffer(valor)) return valor;
  try { return JSON.parse(Buffer.isBuffer(valor) ? valor.toString('utf8') : valor); }
  catch { return predeterminado; }
}

function normalizarHistorial(fila) {
  const revision = fila.estado_decision === 'revision_manual';
  return {
    ...fila,
    resultado: revision ? 'Revision manual' : (fila.resultado || fila.estado_uva || 'Pendiente'),
    estado_decision: fila.estado_decision || 'aceptada',
    clase_propuesta: fila.clase_propuesta || null,
    motivos_revision: parsearJson(fila.motivos_revision, []),
    probabilidades_pct: parsearJson(fila.probabilidades_json, {}),
    confianza: fila.confianza === null ? null : fila.confianza,
    riesgo: fila.riesgo || null,
    modelo_cnn: fila.modelo_cnn || 'Pendiente',
  };
}

module.exports = { guardarDiagnostico, normalizarHistorial, parsearJson };
