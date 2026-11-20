const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID, timingSafeEqual } = require("node:crypto");
const { detectarMime } = require("./services/inferenceClient");
const { guardarDiagnostico, normalizarHistorial } = require("./services/diagnosticosRepository");
const {
    analizarImagenRemota,
    detallesPublicosIA,
    respuestaRevisionManual,
    estadoErrorInferencia
} = require("./services/inferenceClient");

require("dotenv").config();

const app = express();

// =====================================================
// AUTENTICACION DE DISPOSITIVOS IOT (HTTPS + X-Device-Key)
// =====================================================
// Variables PRIVADAS en Render:
// IOT_NODEMCU_KEY e IOT_CAMARA_KEY (minimo 32 caracteres aleatorios).
// En ausencia de una variable el acceso se DENIEGA (HTTP 503).
function verificarDispositivo(variableEntorno) {
    return (req, res, next) => {
        const claveEsperada = process.env[variableEntorno];
        if (typeof claveEsperada !== 'string' || Buffer.byteLength(claveEsperada, 'utf8') < 32) {
            return res.status(503).json({ mensaje: 'Autenticacion IoT no configurada en el servidor' });
        }

        const claveRecibida = req.get('X-Device-Key') || '';
        if (typeof claveRecibida !== 'string') {
            return res.status(401).json({ mensaje: 'Dispositivo no autorizado' });
        }

        const recibida = Buffer.from(claveRecibida, 'utf8');
        const esperada = Buffer.from(claveEsperada, 'utf8');
        if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
            return res.status(401).json({ mensaje: 'Dispositivo no autorizado' });
        }

        next();
    };
}

const validarNodeMCU = verificarDispositivo('IOT_NODEMCU_KEY');
const validarCamara = verificarDispositivo('IOT_CAMARA_KEY');

// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================

// Limita el acceso desde navegadores al dominio del frontend.
const origenesPermitidos = (process.env.FRONTEND_ORIGIN || '')
  .split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin: origenesPermitidos.length ? origenesPermitidos : false }));

// La verificación de salud no depende de MySQL ni del modelo ML.
app.get('/health', (_req, res) => res.json({ status: 'ok', feature: 'diagnosticos_mysql_sin_sensor_v2' }));
app.use(express.json());


// =====================================================
// CARPETA DE IMÁGENES
// =====================================================

const carpetaImagenes = path.join(__dirname, "imagenes");

if (!fs.existsSync(carpetaImagenes)) {

    fs.mkdirSync(carpetaImagenes, {
        recursive: true
    });

    console.log("📁 Carpeta imagenes creada");

}


// =====================================================
// CONFIGURACIÓN MULTER
// =====================================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        cb(null, carpetaImagenes);

    },

    filename: (req, file, cb) => {

        const nombre =
            `imagen-${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`;

        cb(null, nombre);

    }

});


const upload = multer({
    storage: storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const tipos = new Set([
            "image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"
        ]);
        if (!tipos.has(file.mimetype)) {
            return cb(new Error("Solo se permiten archivos de imagen compatibles"));
        }
        cb(null, true);
    }
});


// =====================================================
// CONEXIÓN MYSQL
// =====================================================

const db = require("./db");


// =====================================================
// SERVIR IMÁGENES
// =====================================================

// Fotografías persistidas en MariaDB; incluso tras reinicios de Render.
app.get('/imagenes/db/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: 'Identificador de imagen inválido' });
    }
    db.query(
        'SELECT contenido, tipo_mime FROM imagenes WHERE id_imagen = ? LIMIT 1',
        [id],
        (error, filas) => {
            if (error) {
                console.error('Error recuperando fotografía de MariaDB:', error.message);
                return res.status(500).json({ mensaje: 'No se pudo recuperar la fotografía' });
            }
            if (!filas.length || !filas[0].contenido) {
                return res.status(404).json({ mensaje: 'Fotografía no encontrada' });
            }
            const tipo = filas[0].tipo_mime;
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'].includes(tipo)) {
                return res.status(500).json({ mensaje: 'Formato almacenado no válido' });
            }
            res.set('X-Content-Type-Options', 'nosniff');
            res.set('Cache-Control', 'private, max-age=300');
            res.type(tipo).send(filas[0].contenido);
        }
    );
});

// Compatibilidad con antiguas fotografías que sigan en disco.
// redirect:false evita la redirección de /imagenes a /imagenes/.
app.use('/imagenes', express.static(carpetaImagenes, { redirect: false }));


// =====================================================
// FUNCIÓN PARA CALCULAR RIESGO
// =====================================================
//
// Resultado:
// Bajo
// Medio
// Alto
//
// El riesgo combina:
// 1. Estado visual de la uva
// 2. Temperatura
// 3. Humedad
//
// La clasificación visual tiene mayor peso.
// =====================================================

function calcularRiesgo(
    temperatura,
    humedad,
    estadoUva
) {

    console.log("🔎 Evaluando riesgo...");

    console.log(
        "🍇 Estado de la uva:",
        estadoUva
    );

    console.log(
        "🌡️ Temperatura:",
        temperatura,
        "°C"
    );

    console.log(
        "💧 Humedad:",
        humedad,
        "%"
    );


    // =================================================
    // NORMALIZAR ESTADO
    // =================================================

    const estado =
        String(estadoUva || "")
            .trim()
            .toLowerCase();


    // =================================================
    // REGLAS ACTUALIZADAS PARA ESTADOS FITOSANITARIOS
    // =================================================

    if (
        estado.includes("crítica") ||
        estado.includes("severa") ||
        estado.includes("alta") ||
        estado.includes("podrida") ||
        estado.includes("pudricion_alta")
    ) {

        console.log(
            "⚠️ RIESGO ESTIMADO: Alto"
        );

        return "Alto";

    }


    if (
        estado.includes("leve") ||
        estado.includes("moderada") ||
        estado.includes("deterioro") ||
        estado.includes("pudricion_leve")
    ) {

        console.log(
            "⚠️ RIESGO ESTIMADO: Alto"
        );

        return "Alto";

    }


    // =================================================
    // SI LA UVA ES SANA
    // EVALUAR CONDICIONES AMBIENTALES
    // =================================================

    const temp =
        parseFloat(temperatura);

    const hum =
        parseFloat(humedad);


    // =================================================
    // VALIDAR DATOS AMBIENTALES
    // =================================================

    if (
        isNaN(temp) ||
        isNaN(hum)
    ) {

        console.log(
            "⚠️ Datos ambientales inválidos"
        );

        console.log(
            "⚠️ RIESGO ESTIMADO: Medio"
        );

        return "Medio";

    }


    // =================================================
    // PUNTOS DE RIESGO AMBIENTAL PARA UVAS SANAS
    // =================================================

    let puntosRiesgo = 0;


    // =================================================
    // TEMPERATURA
    // =================================================

    if (temp <= 25) {

        puntosRiesgo += 0;

    } else if (temp <= 30) {

        puntosRiesgo += 1;

    } else {

        puntosRiesgo += 2;

    }


    // =================================================
    // HUMEDAD
    // =================================================

    if (hum <= 70) {

        puntosRiesgo += 0;

    } else if (hum <= 80) {

        puntosRiesgo += 1;

    } else {

        puntosRiesgo += 2;

    }


    // =================================================
    // CALCULAR RIESGO AMBIENTAL
    // =================================================

    let riesgo;


    if (puntosRiesgo <= 1) {

        riesgo = "Bajo";

    } else if (puntosRiesgo <= 2) {

        riesgo = "Medio";

    } else {

        riesgo = "Alto";

    }


    console.log(
        "⚠️ RIESGO ESTIMADO:",
        riesgo
    );


    return riesgo;

}

// =====================================================
// EJECUTAR MACHINE LEARNING
// =====================================================

function analizarImagen(rutaImagen, callback) {
    // FastAPI en Render se encarga de TensorFlow, GrabCut y CV.
    // Esta interfaz callback preserva todas las rutas existentes.
    analizarImagenRemota(rutaImagen)
        .then(resultado => callback(null, resultado))
        .catch(error => {
            console.error("❌ Error consultando FastAPI:", error.code || error.message);
            callback(error, null);
        });
}


// =====================================================
// GUARDAR IMAGEN + DIAGNÓSTICO (SIN EXIGIR SENSORES)
// =====================================================
async function procesarYGuardarImagen(rutaFisica, nombreArchivo, bytes) {
    // Validación del contenido real, no solo la extensión del archivo.
    const mime = detectarMime(bytes);
    const resultadoIA = await analizarImagenRemota(rutaFisica);
    const registro = await guardarDiagnostico(db, {
        bytes,
        mime,
        resultadoIA,
        calcularRiesgo,
        asociarMedicion: process.env.ASOCIAR_MEDICION_IMAGEN === 'true'
    });
    const revision = resultadoIA.estadoDecision === 'revision_manual';
    return {
        status: revision ? 202 : 201,
        body: {
            success: true,
            mensaje: revision
                ? 'Fotografía y evaluación guardadas en MySQL; diagnóstico pendiente de revisión manual'
                : 'Fotografía y diagnóstico guardados correctamente en MySQL',
            id_imagen: registro.id_imagen,
            id_analisis: registro.id_analisis,
            id_medicion: registro.id_medicion,
            estado_uva: revision ? null : resultadoIA.resultadoBD,
            resultado: revision ? null : resultadoIA.resultadoBD,
            confianza: resultadoIA.confianza,
            modelo: resultadoIA.modelo,
            riesgo: registro.riesgo,
            temperatura: registro.temperatura,
            humedad: registro.humedad,
            persistido: true,
            archivo: nombreArchivo,
            ruta: registro.ruta,
            ...detallesPublicosIA(resultadoIA),
        }
    };
}

function responderErrorProcesamiento(res, error) {
    if (error.name === 'InferenceError') {
        return res.status(estadoErrorInferencia(error)).json({
            mensaje: 'No se pudo analizar la fotografía',
            error: error.message
        });
    }
    console.error('No se pudo guardar fotografía/diagnóstico en MariaDB:', error);
    return res.status(500).json({
        mensaje: 'No fue posible guardar la fotografía y su diagnóstico en MySQL',
        ...(process.env.NODE_ENV === 'development' ? {error: error.message} : {})
    });
}

// La subida Ionic utiliza multipart/form-data con campo "imagen".
app.post('/imagenes-subir', upload.single('imagen'), async (req, res) => {
    if (!req.file) return res.status(400).json({ mensaje: 'No se recibió ninguna imagen' });
    try {
        const rutaFisica = path.resolve(req.file.path);
        const bytes = await fs.promises.readFile(rutaFisica);
        const respuesta = await procesarYGuardarImagen(rutaFisica, req.file.filename, bytes);
        return res.status(respuesta.status).json(respuesta.body);
    } catch (error) {
        return responderErrorProcesamiento(res, error);
    } finally {
        // No dependemos del disco temporal de Render.
        await fs.promises.unlink(req.file.path).catch(() => {});
    }
});

// ESP32-CAM: acepta JPEG solo como respuesta a una orden remota activa.
// La clave se verifica con el mismo middleware IoT ya utilizado en Render.
app.post('/imagenes-directa', validarCamara, express.raw({ type: 'image/jpeg', limit: '8mb' }), async (req, res) => {
    const idOrden = Number(req.get('X-Capture-Id'));
    if (!Number.isSafeInteger(idOrden) || idOrden < 1) {
        return res.status(400).json({ mensaje: 'Falta X-Capture-Id de una orden de captura' });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ mensaje: 'No se recibio ninguna imagen JPEG' });
    }
    // Evita subir fotografias sin haber pulsado Tomar foto, y evita duplicaciones.
    let marcada = false;
    let rutaFisica = null;
    try {
        const [claim] = await db.promise().query(
            `UPDATE ordenes_captura_esp32 SET estado = 'recibida'
             WHERE id_orden = ? AND estado = 'procesando' AND active_slot = 1`,
            [idOrden]
        );
        if (claim.affectedRows !== 1) {
            return res.status(409).json({ mensaje: 'Orden de captura inexistente, vencida o ya utilizada' });
        }
        marcada = true;
        const nombreArchivo = `imagen-${Date.now()}-${randomUUID()}.jpg`;
        rutaFisica = path.join(carpetaImagenes, nombreArchivo);
        await fs.promises.writeFile(rutaFisica, req.body);
        const respuesta = await procesarYGuardarImagen(rutaFisica, nombreArchivo, req.body);
        await db.promise().query(
            `UPDATE ordenes_captura_esp32
             SET estado = 'completada', active_slot = NULL,
                 fecha_fin = NOW(), id_imagen = ?, mensaje_error = NULL
             WHERE id_orden = ? AND estado = 'recibida'`,
            [respuesta.body.id_imagen, idOrden]
        );
        return res.status(respuesta.status).json({ ...respuesta.body, id_orden: idOrden });
    } catch (error) {
        if (marcada) {
            try {
                await db.promise().query(
                    `UPDATE ordenes_captura_esp32
                     SET estado = 'fallida', active_slot = NULL, fecha_fin = NOW(),
                         mensaje_error = 'No se pudo analizar o guardar la fotografia'
                     WHERE id_orden = ? AND estado = 'recibida'`,
                    [idOrden]
                );
            } catch (errorSQL) {
                console.error('No se pudo registrar fallo de captura:', errorSQL.message);
            }
        }
        return responderErrorProcesamiento(res, error);
    } finally {
        if (rutaFisica) await fs.promises.unlink(rutaFisica).catch(() => {});
    }
});

// =====================================================
// GENERAR SOLO INFERENCIA DE ML (SIN GUARDAR EN BD NI DISCO)
// =====================================================
app.post(
    "/inferencia",
    express.raw({ type: "image/jpeg", limit: "10mb" }),
    (req, res) => {
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({
                mensaje: "No se recibió ninguna imagen para inferencia"
            });
        }

        const nombreTemp = `temp-inferencia-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
        const rutaTemp = path.join(carpetaImagenes, nombreTemp);

        fs.writeFile(rutaTemp, req.body, (errWrite) => {
            if (errWrite) {
                return res.status(500).json({
                    mensaje: "Error al procesar archivo temporal",
                    error: errWrite.message
                });
            }

            analizarImagen(rutaTemp, (errML, resultadoML) => {
                // Eliminar archivo temporal inmediatamente para NO dejar nada en disco
                fs.unlink(rutaTemp, (errUnlink) => {
                    if (errUnlink) console.log("⚠️ No se pudo eliminar temp:", errUnlink);
                });

                if (errML) {
                    return res.status(estadoErrorInferencia(errML)).json({
                        mensaje: "Error generando la inferencia de ML",
                        error: errML.message
                    });
                }

                console.log("⚡ Inferencia volátil generada (sin persistencia):", resultadoML.resultadoBD);

                return res.json({
                    success: true,
                    mensaje: "Inferencia generada exitosamente (sin guardar en BD ni disco)",
                    clase: resultadoML.estadoUva,
                    resultadoBD: resultadoML.resultadoBD,
                    confianza: resultadoML.confianza,
                    modelo: resultadoML.modelo,
                    persistido: false,
                    ...detallesPublicosIA(resultadoML)
                });
            });
        });
    }
);


// =====================================================
// RUTA PRINCIPAL
// =====================================================

app.get(

    "/",

    (req, res) => {

        res.send(
            "Servidor de Telemetría IoT funcionando correctamente"
        );

    }

);


// =====================================================
// GUARDAR MEDICIONES NODEMCU
// =====================================================

app.post('/mediciones', validarNodeMCU, (req, res) => {
    const datos = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body : {};
    const { id_sensor, temperatura, humedad } = datos;

    // No aceptar campos faltantes ni valores NaN, Infinity o numeros fuera de rango.
    const sensor = Number(id_sensor);
    const temp = Number(temperatura);
    const hum = Number(humedad);
    const valido = id_sensor !== undefined && id_sensor !== null && id_sensor !== ''
        && temperatura !== undefined && temperatura !== null && temperatura !== ''
        && humedad !== undefined && humedad !== null && humedad !== ''
        && Number.isSafeInteger(sensor) && sensor > 0
        && Number.isFinite(temp) && temp >= -40 && temp <= 85
        && Number.isFinite(hum) && hum >= 0 && hum <= 100;

    if (!valido) {
        return res.status(400).json({
            mensaje: 'Datos invalidos: id_sensor debe ser entero positivo; temperatura -40 a 85 C; humedad 0 a 100 %'
        });
    }

    // La tabla mediciones mantiene el contrato que ya consume Ionic.
    const sql = 'INSERT INTO mediciones (id_sensor, temperatura, humedad) VALUES (?, ?, ?)';
    db.query(sql, [sensor, temp, hum], (err, result) => {
        if (err) {
            if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                return res.status(422).json({
                    mensaje: 'id_sensor no registrado en la tabla sensores'
                });
            }
            console.error('Error guardando medicion IoT:', err.code || err.message);
            return res.status(500).json({ mensaje: 'Error al guardar la medicion' });
        }

        return res.status(200).json({
            mensaje: 'Medicion guardada correctamente',
            id: result.insertId
        });
    });
});

// =====================================================
// CONSULTAR MEDICIONES
// =====================================================

app.get(

    "/mediciones",

    (req, res) => {


        const sql = `

            SELECT

                id_medicion,

                id_sensor,

                temperatura,

                humedad,

                fecha_hora

            FROM mediciones

            ORDER BY fecha_hora DESC

            LIMIT 50

        `;


        db.query(

            sql,

            (err, resultados) => {


                if (err) {

                    console.log(
                        "❌ Error consultando mediciones:",
                        err
                    );


                    return res.status(500).json({

                        mensaje:
                            "Error consultando mediciones",

                        error:
                            err.message

                    });

                }


                // =================================================
                // ORDENAR ASCENDENTE
                // =================================================

                resultados =
                    resultados.reverse();


                return res.json(
                    resultados
                );

            }

        );

    }

);


// =====================================================
// HISTORIAL DE FOTOGRAFÍAS Y DIAGNÓSTICOS
// =====================================================
app.get('/imagenes', (_req, res) => {
    const sql = `
        SELECT i.id_imagen, i.id_medicion, i.ruta_imagen,
               i.estado_uva, i.fecha_hora,
               m.temperatura, m.humedad,
               a.modelo_cnn, a.resultado, a.confianza, a.riesgo,
               a.estado_decision, a.clase_propuesta,
               a.motivos_revision, a.probabilidades_json,
               a.fecha_hora AS fecha_analisis
        FROM imagenes i
        LEFT JOIN mediciones m ON i.id_medicion = m.id_medicion
        LEFT JOIN analisis_imagen a ON i.id_imagen = a.id_imagen
        ORDER BY i.fecha_hora DESC, i.id_imagen DESC
        LIMIT 50
    `;
    db.query(sql, (error, filas) => {
        if (error) {
            console.error('Error consultando historial:', error.message);
            return res.status(500).json({ mensaje: 'Error consultando el historial de diagnósticos' });
        }
        return res.json(filas.map(normalizarHistorial));
    });
});

// =====================================================
// OBTENER ÚLTIMA MEDICIÓN
// =====================================================

app.get(

    "/medicion-actual",

    (req, res) => {


        const sql = `

            SELECT

                id_medicion,

                id_sensor,

                temperatura,

                humedad,

                fecha_hora

            FROM mediciones

            ORDER BY fecha_hora DESC

            LIMIT 1

        `;


        db.query(

            sql,

            (err, resultado) => {


                if (err) {

                    console.log(
                        "❌ Error obteniendo medición:",
                        err
                    );


                    return res.status(500).json({

                        mensaje:
                            "Error obteniendo medición",

                        error:
                            err.message

                    });

                }


                return res.json(

                    resultado[0] || null

                );

            }

        );

    }

);


// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;


app.listen(

    PORT,

    process.env.IP || "0.0.0.0",

    () => {


        console.log(
            "=========================================="
        );


        console.log(
            "🚀 SERVIDOR DE TELEMETRÍA IoT"
        );


        console.log(
            `🚀 Servidor ejecutándose en puerto ${PORT}`
        );


        console.log(
            "🤖 Machine Learning activado"
        );


        console.log(
            "🔎 Estimación automática de riesgo activada"
        );


        console.log(
            "💾 Guardado de riesgo en MySQL activado"
        );


        console.log(
            "📡 Recepción de sensores activada"
        );


        console.log(
            "📸 Recepción de imágenes activada"
        );


        console.log(
            "=========================================="
        );

    }

);

// =====================================================
// CAPTURA REMOTA BAJO DEMANDA (Render -> MariaDB <- ESP32-CAM)
// =====================================================
// Requiere la migracion sql/2026_11_esp32_captura_remota.sql
// No se intenta acceder a IPs privadas desde Render.
// LIMITACION: el frontend actual no tiene login; el POST se limita al
// Origin del sitio configurado, PERO Origin no reemplaza autenticacion.
function origenValidoParaCaptura(req) {
    const origen = req.get('Origin');
    return Boolean(origen && origenesPermitidos.includes(origen));
}

async function expirarOrdenesViejas() {
    // Si la camara queda desconectada o FastAPI tarda demasiado,
    // liberar la unica orden activa sin perder su historial.
    await db.promise().query(`
        UPDATE ordenes_captura_esp32
        SET estado = 'expirada', active_slot = NULL, fecha_fin = NOW(),
            mensaje_error = 'Tiempo limite de captura agotado'
        WHERE active_slot = 1 AND (
            (estado = 'pendiente' AND fecha_solicitud < NOW() - INTERVAL 3 MINUTE)
            OR (estado IN ('procesando', 'recibida')
                AND fecha_inicio < NOW() - INTERVAL 8 MINUTE)
        )
    `);
}

// Boton del frontend: crea UNA orden, no hace una foto por si mismo.
app.post('/capturar-esp32', async (req, res) => {
    if (!origenValidoParaCaptura(req)) {
        return res.status(403).json({ mensaje: 'Origen no autorizado para solicitar capturas' });
    }
    try {
        await expirarOrdenesViejas();
        const [resultado] = await db.promise().query(
            `INSERT INTO ordenes_captura_esp32 (estado, active_slot)
             VALUES ('pendiente', 1)`
        );
        return res.status(202).json({
            id_orden: resultado.insertId,
            estado: 'pendiente',
            mensaje: 'Orden enviada. Esperando conexion de ESP32-CAM.'
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ mensaje: 'Ya existe una captura pendiente o en proceso' });
        }
        console.error('Error al crear orden remota:', error.message);
        return res.status(500).json({ mensaje: 'No se pudo registrar la orden de captura' });
    }
});

// El navegador consulta el resultado hasta mostrar la fotografia en el historial.
app.get('/capturar-esp32/estado/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ mensaje: 'ID de orden invalido' });
    }
    try {
        await expirarOrdenesViejas();
        const [filas] = await db.promise().query(
            `SELECT id_orden, estado, id_imagen, mensaje_error
             FROM ordenes_captura_esp32 WHERE id_orden = ? LIMIT 1`, [id]
        );
        if (!filas.length) return res.status(404).json({ mensaje: 'Orden no encontrada' });
        return res.json(filas[0]);
    } catch (error) {
        console.error('Error consultando estado de captura:', error.message);
        return res.status(500).json({ mensaje: 'No se pudo consultar el estado de captura' });
    }
});

// Si falla el sensor optico antes de producir un JPEG, libera la orden.
app.post('/esp32/orden-fallida', validarCamara, async (req, res) => {
    const id = Number(req.body?.id_orden);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ mensaje: 'ID de orden invalido' });
    }
    try {
        const [resultado] = await db.promise().query(
            `UPDATE ordenes_captura_esp32
             SET estado = 'fallida', active_slot = NULL, fecha_fin = NOW(),
                 mensaje_error = 'La camara no pudo generar la fotografia'
             WHERE id_orden = ? AND estado = 'procesando' AND active_slot = 1`,
            [id]
        );
        return res.status(resultado.affectedRows ? 200 : 409)
            .json({ success: resultado.affectedRows === 1 });
    } catch (error) {
        console.error('Error liberando orden de captura:', error.message);
        return res.status(500).json({ mensaje: 'No se pudo actualizar la orden' });
    }
});

// La camara consulta periodicamente. Solo la camara puede usar esta ruta.
// Responde texto plano: "0" si no hay trabajo, o ID positivo si hay orden.
app.get('/esp32/orden-pendiente', validarCamara, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        await expirarOrdenesViejas();
        const [claim] = await db.promise().query(
            `UPDATE ordenes_captura_esp32
             SET estado = 'procesando', fecha_inicio = NOW()
             WHERE estado = 'pendiente' AND active_slot = 1
             ORDER BY id_orden ASC LIMIT 1`
        );
        if (!claim.affectedRows) return res.type('text/plain').send('0');
        const [filas] = await db.promise().query(
            `SELECT id_orden FROM ordenes_captura_esp32
             WHERE estado = 'procesando' AND active_slot = 1 LIMIT 1`
        );
        return res.type('text/plain').send(filas.length ? String(filas[0].id_orden) : '0');
    } catch (error) {
        console.error('Error consultando orden para ESP32:', error.message);
        return res.status(500).type('text/plain').send('error');
    }
});

// Errores de carga (Multer). Mantiene respuestas JSON para Ionic.
app.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ mensaje: 'Imagen rechazada', error: error.message });
    }
    if (error && error.message === 'Solo se permiten archivos de imagen compatibles') {
        return res.status(415).json({ mensaje: error.message });
    }
    next(error);
});
