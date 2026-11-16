'use strict';

/**
 * Cliente HTTP de FastAPI. Nunca ejecuta Python ni guarda credenciales.
 * Node.js >= 20: fetch, Blob y FormData nativos.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { Blob } = require('node:buffer');

const DEFAULT_URL = 'https://servicio-ia-uvas.onrender.com';
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

class InferenceError extends Error {
  constructor(message, statusCode = 502, code = 'INFERENCE_ERROR') {
    super(message);
    this.name = 'InferenceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizarClase(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CLASES_BD = new Map([
  ['sano', 'Sana'],
  ['sana', 'Sana'],
  ['pudricion leve', 'Con deterioro'],
  ['pudricion alta', 'Podrida'],
]);

function mapearClaseBD(clasePropuesta) {
  const clase = CLASES_BD.get(normalizarClase(clasePropuesta));
  if (!clase) {
    throw new InferenceError(
      'La IA devolvió una clase no reconocida por el sistema',
      502,
      'UNKNOWN_CLASS'
    );
  }
  return clase;
}

function detectarMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && bytes.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
  if (bytes.length >= 4 && (bytes.subarray(0,4).equals(Buffer.from([73,73,42,0])) || bytes.subarray(0,4).equals(Buffer.from([77,77,0,42])))) return 'image/tiff';
  throw new InferenceError('El archivo no es una imagen compatible', 415, 'INVALID_IMAGE');
}

function validarRespuestaIA(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InferenceError('FastAPI devolvió una respuesta inválida', 502, 'BAD_INFERENCE_RESPONSE');
  }
  const estado = payload.estado_decision;
  if (!['aceptada', 'revision_manual'].includes(estado)) {
    throw new InferenceError('FastAPI devolvió un estado de decisión desconocido', 502, 'BAD_INFERENCE_RESPONSE');
  }
  const clasePropuesta = String(payload.clase_propuesta || '');
  const claseBDPropuesta = mapearClaseBD(clasePropuesta);
  const confianza = payload.confianza_pct;
  if (typeof confianza !== 'number' || !Number.isFinite(confianza) || confianza < 0 || confianza > 100) {
    throw new InferenceError('FastAPI devolvió una confianza inválida', 502, 'BAD_INFERENCE_RESPONSE');
  }
  const modelo = typeof payload.modelo === 'string' && payload.modelo.trim()
    ? payload.modelo.trim()
    : 'Keras';
  const motivos = Array.isArray(payload.motivos_revision)
    ? payload.motivos_revision.filter(x => typeof x === 'string').slice(0, 20)
    : [];

  // Nunca insertamos una revisión manual como un estado fitosanitario confirmado.
  return {
    estadoUva: estado === 'aceptada' ? clasePropuesta : 'Revision manual',
    clasePropuesta,
    claseBDPropuesta,
    resultadoBD: estado === 'aceptada' ? claseBDPropuesta : null,
    confianza, // 0 a 100, como lo almacenaba el backend previo.
    modelo,
    diagnostico: estado === 'aceptada' ? clasePropuesta : 'Revision manual',
    estadoDecision: estado,
    motivosRevision: motivos,
    probabilidadesPct: payload.probabilidades_pct || {},
    detalleIA: payload,
  };
}

async function analizarImagenRemota(rutaImagen, { fetchImpl = globalThis.fetch } = {}) {
  const endpoint = String(process.env.INFERENCE_API_URL || DEFAULT_URL).trim().replace(/\/+$/, '');
  const key = process.env.INFERENCE_API_KEY;
  if (!key) {
    throw new InferenceError('Falta configurar INFERENCE_API_KEY en el backend Node.js', 503, 'MISSING_API_KEY');
  }
  if (!/^https:\/\//i.test(endpoint) && !/^http:\/\/localhost(?::\d+)?$/i.test(endpoint) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(endpoint)) {
    throw new InferenceError('INFERENCE_API_URL debe usar HTTPS', 503, 'BAD_API_URL');
  }
  const timeout = Number(process.env.INFERENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) {
    throw new InferenceError('INFERENCE_TIMEOUT_MS no es válido', 503, 'BAD_TIMEOUT');
  }
  const limite = Number(process.env.INFERENCE_MAX_IMAGE_BYTES || DEFAULT_MAX_BYTES);
  if (!Number.isInteger(limite) || limite < 1024 || limite > 50 * 1024 * 1024) {
    throw new InferenceError('INFERENCE_MAX_IMAGE_BYTES no es válido', 503, 'BAD_IMAGE_LIMIT');
  }

  let stats;
  try {
    stats = await fs.stat(rutaImagen);
  } catch {
    throw new InferenceError('No se pudo acceder a la imagen para analizar', 500, 'FILE_NOT_FOUND');
  }
  if (stats.size === 0) throw new InferenceError('La imagen está vacía', 400, 'EMPTY_IMAGE');
  if (stats.size > limite) throw new InferenceError('La imagen supera el tamaño permitido', 413, 'FILE_TOO_LARGE');
  const bytes = await fs.readFile(rutaImagen);
  const mime = detectarMime(bytes);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), path.basename(rutaImagen));

  let response;
  try {
    response = await fetchImpl(`${endpoint}/api/v1/predict`, {
      method: 'POST',
      headers: { 'X-API-Key': key },
      body: form,
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new InferenceError('Tiempo de espera agotado al consultar el servicio de IA', 504, 'INFERENCE_TIMEOUT');
    }
    throw new InferenceError('No fue posible conectar con el servicio de IA', 502, 'INFERENCE_UNAVAILABLE');
  }

  if (!response.ok) {
    if (response.status === 413) throw new InferenceError('Imagen demasiado grande para el servicio de IA', 413, 'IMAGE_TOO_LARGE');
    if (response.status === 415 || response.status === 422 || response.status === 400) {
      throw new InferenceError('El servicio de IA rechazó el formato o contenido de la imagen', 422, 'INVALID_IMAGE');
    }
    if (response.status === 401 || response.status === 403) {
      throw new InferenceError('Autenticación entre servicios de IA no autorizada; revisa las variables privadas', 502, 'UPSTREAM_AUTH_FAILED');
    }
    throw new InferenceError('El servicio de IA no pudo procesar la imagen', 502, 'INFERENCE_UPSTREAM_ERROR');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new InferenceError('FastAPI devolvió un JSON inválido', 502, 'BAD_INFERENCE_RESPONSE');
  }
  return validarRespuestaIA(payload);
}

function detallesPublicosIA(resultado) {
  return {
    clase_propuesta: resultado.clasePropuesta,
    diagnostico: resultado.diagnostico,
    estado_decision: resultado.estadoDecision,
    motivos_revision: resultado.motivosRevision,
    probabilidades_pct: resultado.probabilidadesPct,
    analisis_ia: resultado.detalleIA,
  };
}

function respuestaRevisionManual(resultado, archivo, ruta) {
  return {
    mensaje: 'La fotografía requiere revisión manual; no se registró un diagnóstico definitivo en MySQL',
    estado_uva: null,
    resultado: null,
    confianza: resultado.confianza,
    modelo: resultado.modelo,
    riesgo: null,
    id_imagen: null,
    id_medicion: null,
    archivo,
    ruta,
    persistido: false,
    ...detallesPublicosIA(resultado),
  };
}

function estadoErrorInferencia(error) {
  return Number.isInteger(error && error.statusCode) ? error.statusCode : 502;
}

module.exports = {
  analizarImagenRemota,
  mapearClaseBD,
  validarRespuestaIA,
  detectarMime,
  detallesPublicosIA,
  respuestaRevisionManual,
  estadoErrorInferencia,
  InferenceError,
};
