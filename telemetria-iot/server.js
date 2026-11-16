const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
    analizarImagenRemota,
    detallesPublicosIA,
    respuestaRevisionManual,
    estadoErrorInferencia
} = require("./services/inferenceClient");
const axios = require('axios');

require("dotenv").config();

const app = express();

// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================

// Limita el acceso desde navegadores al dominio del frontend.
const origenesPermitidos = (process.env.FRONTEND_ORIGIN || '')
  .split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin: origenesPermitidos.length ? origenesPermitidos : false }));

// La verificación de salud no depende de MySQL ni del modelo ML.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
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
            `imagen-${Date.now()}${path.extname(file.originalname)}`;

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

app.use(
    "/imagenes",
    express.static(carpetaImagenes)
);


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
// SUBIR IMAGEN DESDE IONIC
// ANALIZAR Y GUARDAR
// =====================================================

app.post(

    "/imagenes-subir",

    upload.single("imagen"),

    (req, res) => {


        // =================================================
        // VALIDAR IMAGEN
        // =================================================

        if (!req.file) {

            return res.status(400).json({

                mensaje:
                    "No se recibió ninguna imagen"

            });

        }


        console.log(
            "📸 Imagen recibida desde Ionic:",
            req.file.filename
        );


        // =================================================
        // RUTA FÍSICA
        // =================================================

        const rutaImagenFisica =
            path.resolve(
                req.file.path
            );


        console.log(
            "📂 Ruta de imagen:",
            rutaImagenFisica
        );


        // =================================================
        // ANALIZAR IMAGEN
        // =================================================

        analizarImagen(

            rutaImagenFisica,

            (errorModelo, resultadoModelo) => {


                if (errorModelo) {

                    console.log(
                        "❌ Error del modelo:",
                        errorModelo
                    );


                    return res.status(estadoErrorInferencia(errorModelo)).json({

                        mensaje:
                            "La imagen se guardó, pero ocurrió un error al analizarla",

                        error:
                            errorModelo.message

                    });

                }


                // Revisión manual: la BD actual no tiene un estado pendiente.
                // No insertar una clase provisional como si fuera definitiva.
                if (resultadoModelo.estadoDecision === "revision_manual") {
                    return res.status(202).json(respuestaRevisionManual(
                        resultadoModelo,
                        req.file.filename,
                        `/imagenes/${req.file.filename}`
                    ));
                }

                // =================================================
                // RESULTADOS ML
                // =================================================

                const resultadoBD =
                    resultadoModelo.resultadoBD;


                const confianza =
                    resultadoModelo.confianza;


                console.log(
                    "🍇 Resultado para MySQL:",
                    resultadoBD
                );


                // =================================================
                // BUSCAR ÚLTIMA MEDICIÓN
                // =================================================

                const sqlMedicion = `

                    SELECT
                        id_medicion,
                        temperatura,
                        humedad

                    FROM mediciones

                    ORDER BY fecha_hora DESC

                    LIMIT 1

                `;


                db.query(

                    sqlMedicion,

                    (err, resultadoMedicion) => {


                        if (err) {

                            console.log(
                                "❌ Error buscando medición:",
                                err
                            );


                            return res.status(500).json({

                                mensaje:
                                    "Error buscando última medición",

                                error:
                                    err.message

                            });

                        }


                        if (
                            resultadoMedicion.length === 0
                        ) {

                            return res.status(400).json({

                                mensaje:
                                    "La imagen se analizó, pero no existen mediciones"

                            });

                        }


                        // =================================================
                        // DATOS AMBIENTALES
                        // =================================================

                        const medicion =
                            resultadoMedicion[0];


                        const id_medicion =
                            medicion.id_medicion;


                        const temperatura =
                            parseFloat(
                                medicion.temperatura
                            );


                        const humedad =
                            parseFloat(
                                medicion.humedad
                            );


                        console.log(
                            "🆔 ID medición:",
                            id_medicion
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
                        // CALCULAR RIESGO
                        // =================================================

                        const riesgo =
                            calcularRiesgo(

                                temperatura,

                                humedad,

                                resultadoBD

                            );


                        // =================================================
                        // RUTA DE IMAGEN
                        // =================================================

                        const rutaImagen =
                            `/imagenes/${req.file.filename}`;


                        // =================================================
                        // INSERTAR IMAGEN
                        // =================================================

                        const sqlImagen = `

                            INSERT INTO imagenes

                            (
                                id_medicion,
                                ruta_imagen,
                                estado_uva
                            )

                            VALUES (?, ?, ?)

                        `;


                        db.query(

                            sqlImagen,

                            [

                                id_medicion,

                                rutaImagen,

                                resultadoBD

                            ],

                            (err, resultadoImagen) => {


                                if (err) {

                                    console.log(
                                        "❌ Error guardando imagen:",
                                        err
                                    );


                                    return res.status(500).json({

                                        mensaje:
                                            "Imagen analizada, pero no se pudo guardar",

                                        error:
                                            err.message

                                    });

                                }


                                const id_imagen =
                                    resultadoImagen.insertId;


                                console.log(
                                    "✅ Imagen registrada correctamente"
                                );


                                console.log(
                                    "🆔 ID imagen:",
                                    id_imagen
                                );


                                // =================================================
                                // GUARDAR ANÁLISIS + RIESGO
                                // =================================================

                                const sqlAnalisis = `

                                    INSERT INTO analisis_imagen

                                    (
                                        id_imagen,
                                        modelo_cnn,
                                        resultado,
                                        confianza,
                                        riesgo
                                    )

                                    VALUES (?, ?, ?, ?, ?)

                                `;


                                db.query(

                                    sqlAnalisis,

                                    [

                                        id_imagen,

                                        resultadoModelo.modelo,

                                        resultadoBD,

                                        confianza,

                                        riesgo

                                    ],

                                    (err, resultadoAnalisis) => {


                                        if (err) {

                                            console.log(
                                                "❌ Error guardando análisis:",
                                                err
                                            );


                                            return res.status(500).json({

                                                mensaje:
                                                    "Imagen guardada, pero no se pudo guardar el análisis",

                                                error:
                                                    err.message

                                            });

                                        }


                                        console.log(
                                            "✅ Análisis guardado correctamente"
                                        );


                                        console.log(
                                            "🆔 ID análisis:",
                                            resultadoAnalisis.insertId
                                        );


                                        console.log(
                                            "🍇 Resultado guardado:",
                                            resultadoBD
                                        );


                                        console.log(
                                            "📊 Confianza guardada:",
                                            confianza
                                        );


                                        console.log(
                                            "⚠️ Riesgo guardado:",
                                            riesgo
                                        );


                                        // =================================================
                                        // RESPUESTA A IONIC
                                        // =================================================

                                        return res.json({

                                            mensaje:
                                                "Imagen subida, analizada y registrada correctamente",

                                            id_imagen:
                                                id_imagen,

                                            id_medicion:
                                                id_medicion,

                                            estado_uva:
                                                resultadoBD,

                                            resultado:
                                                resultadoBD,

                                            confianza:
                                                confianza,

                                            modelo:
                                                resultadoModelo.modelo,
                                            ...detallesPublicosIA(resultadoModelo),
                                            persistido: true,

                                            temperatura:
                                                temperatura,

                                            humedad:
                                                humedad,

                                            riesgo:
                                                riesgo,

                                            archivo:
                                                req.file.filename,

                                            ruta:
                                                rutaImagen

                                        });

                                    }

                                );

                            }

                        );

                    }

                );

            }

        );

    }

);


// =====================================================
// RECIBIR IMAGEN DESDE ESP32-CAM
// =====================================================

// =====================================================
// RECIBIR IMAGEN DESDE ESP32-CAM CON ANÁLISIS COMPLETO
// =====================================================

app.post(
    "/imagenes-directa",
    express.raw({
        type: "image/jpeg",
        limit: "10mb"
    }),
    (req, res) => {

        // =================================================
        // VALIDAR IMAGEN
        // =================================================
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({
                mensaje: "No se recibió ninguna imagen"
            });
        }

        // =================================================
        // NOMBRE Y RUTA DE ARCHIVO
        // =================================================
        const nombreArchivo = `imagen-${Date.now()}.jpg`;
        const rutaArchivo = path.join(carpetaImagenes, nombreArchivo);

        // =================================================
        // GUARDAR ARCHIVO EN DISCO
        // =================================================
        fs.writeFile(rutaArchivo, req.body, (err) => {

            if (err) {
                console.log("❌ Error guardando imagen:", err);
                return res.status(500).json({
                    mensaje: "Error al guardar la imagen",
                    error: err.message
                });
            }

            console.log("📸 Imagen ESP32-CAM guardada en disco:", nombreArchivo);

            // =================================================
            // ANALIZAR IMAGEN CON ML
            // =================================================
            analizarImagen(rutaArchivo, (errorModelo, resultadoModelo) => {

                if (errorModelo) {
                    console.log("❌ Error del modelo:", errorModelo);
                    return res.status(estadoErrorInferencia(errorModelo)).json({
                        mensaje: "La imagen se guardó, pero ocurrió un error al analizarla",
                        error: errorModelo.message
                    });
                }

                if (resultadoModelo.estadoDecision === "revision_manual") {
                    return res.status(202).json(respuestaRevisionManual(
                        resultadoModelo,
                        nombreArchivo,
                        `/imagenes/${nombreArchivo}`
                    ));
                }

                const resultadoBD = resultadoModelo.resultadoBD;
                const confianza = resultadoModelo.confianza;

                console.log("🍇 Resultado ML para ESP32-CAM:", resultadoBD);

                // =================================================
                // BUSCAR ÚLTIMA MEDICIÓN
                // =================================================
                const sqlMedicion = `
                    SELECT
                        id_medicion,
                        temperatura,
                        humedad
                    FROM mediciones
                    ORDER BY fecha_hora DESC
                    LIMIT 1
                `;

                db.query(sqlMedicion, (err, resultadoMedicion) => {

                    if (err) {
                        console.log("❌ Error buscando medición:", err);
                        return res.status(500).json({
                            mensaje: "Error buscando última medición",
                            error: err.message
                        });
                    }

                    if (resultadoMedicion.length === 0) {
                        return res.status(400).json({
                            mensaje: "La imagen se analizó, pero no existen mediciones"
                        });
                    }

                    // =================================================
                    // DATOS AMBIENTALES
                    // =================================================
                    const medicion = resultadoMedicion[0];
                    const id_medicion = medicion.id_medicion;
                    const temperatura = parseFloat(medicion.temperatura);
                    const humedad = parseFloat(medicion.humedad);

                    // =================================================
                    // CALCULAR RIESGO
                    // =================================================
                    const riesgo = calcularRiesgo(
                        temperatura,
                        humedad,
                        resultadoBD
                    );

                    const rutaImagen = `/imagenes/${nombreArchivo}`;

                    // =================================================
                    // INSERTAR IMAGEN EN BD (CON ESTADO_UVA)
                    // =================================================
                    const sqlImagen = `
                        INSERT INTO imagenes
                        (
                            id_medicion,
                            ruta_imagen,
                            estado_uva
                        )
                        VALUES (?, ?, ?)
                    `;

                    db.query(
                        sqlImagen,
                        [id_medicion, rutaImagen, resultadoBD],
                        (err, resultadoImagen) => {

                            if (err) {
                                console.log("❌ Error guardando imagen:", err);
                                return res.status(500).json({
                                    mensaje: "Imagen analizada, pero no se pudo guardar en BD",
                                    error: err.message
                                });
                            }

                            const id_imagen = resultadoImagen.insertId;

                            // =================================================
                            // GUARDAR ANÁLISIS + RIESGO EN BD
                            // =================================================
                            const sqlAnalisis = `
                                INSERT INTO analisis_imagen
                                (
                                    id_imagen,
                                    modelo_cnn,
                                    resultado,
                                    confianza,
                                    riesgo
                                )
                                VALUES (?, ?, ?, ?, ?)
                            `;

                            db.query(
                                sqlAnalisis,
                                [
                                    id_imagen,
                                    resultadoModelo.modelo,
                                    resultadoBD,
                                    confianza,
                                    riesgo
                                ],
                                (err, resultadoAnalisis) => {

                                    if (err) {
                                        console.log("❌ Error guardando análisis:", err);
                                        return res.status(500).json({
                                            mensaje: "Imagen guardada, pero no se pudo guardar el análisis",
                                            error: err.message
                                        });
                                    }

                                    console.log("✅ Análisis ESP32-CAM completado y guardado correctamente");

                                    // =================================================
                                    // RESPUESTA CON DIAGNÓSTICO COMPLETO
                                    // =================================================
                                    return res.json({
                                        mensaje: "Imagen ESP32-CAM subida, analizada y registrada correctamente",
                                        id_imagen: id_imagen,
                                        id_medicion: id_medicion,
                                        estado_uva: resultadoBD,
                                        resultado: resultadoBD,
                                        confianza: confianza,
                                        modelo: resultadoModelo.modelo,
                                        ...detallesPublicosIA(resultadoModelo),
                                        persistido: true,
                                        temperatura: temperatura,
                                        humedad: humedad,
                                        riesgo: riesgo,
                                        archivo: nombreArchivo,
                                        ruta: rutaImagen
                                    });
                                }
                            );
                        }
                    );
                });
            });
        });
    }
);


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

app.post(

    "/mediciones",

    (req, res) => {


        const {

            id_sensor,

            temperatura,

            humedad

        } = req.body;


        console.log(
            "📡 Datos recibidos del sensor:"
        );


        console.log(
            req.body
        );


        // =================================================
        // VALIDAR
        // =================================================

        if (
            id_sensor === undefined ||
            temperatura === undefined ||
            humedad === undefined
        ) {

            return res.status(400).json({

                mensaje:
                    "Faltan datos del sensor"

            });

        }


        // =================================================
        // SQL
        // =================================================

        const sql = `

            INSERT INTO mediciones

            (
                id_sensor,
                temperatura,
                humedad
            )

            VALUES (?, ?, ?)

        `;


        db.query(

            sql,

            [

                id_sensor,

                temperatura,

                humedad

            ],

            (err, result) => {


                if (err) {

                    console.log(
                        "❌ Error guardando medición:",
                        err
                    );


                    return res.status(500).json({

                        mensaje:
                            "Error al guardar la medición",

                        error:
                            err.message

                    });

                }


                console.log(
                    "✅ Medición guardada correctamente"
                );


                return res.json({

                    mensaje:
                        "Medición guardada correctamente",

                    id:
                        result.insertId

                });

            }

        );

    }

);


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
// CONSULTAR IMÁGENES
// + MEDICIONES
// + ANÁLISIS
// + RIESGO GUARDADO
// =====================================================

app.get(

    "/imagenes",

    (req, res) => {


        const sql = `

            SELECT

                i.id_imagen,

                i.id_medicion,

                i.ruta_imagen,

                i.estado_uva,

                i.fecha_hora,

                m.temperatura,

                m.humedad,

                a.modelo_cnn,

                a.resultado,

                a.confianza,

                a.riesgo,

                a.fecha_hora AS fecha_analisis

            FROM imagenes i

            LEFT JOIN mediciones m

                ON i.id_medicion =
                   m.id_medicion

            LEFT JOIN analisis_imagen a

                ON i.id_imagen =
                   a.id_imagen

            ORDER BY
                i.fecha_hora DESC

            LIMIT 50

        `;


        db.query(

            sql,

            (err, resultados) => {


                if (err) {

                    console.log(
                        "❌ Error consultando imágenes:",
                        err
                    );


                    return res.status(500).json({

                        mensaje:
                            "Error consultando imágenes",

                        error:
                            err.message

                    });

                }


                // =================================================
                // LIMPIAR VALORES NULL
                // =================================================

                const datosFinales =
                    resultados.map(

                        (imagen) => {


                            return {

                                ...imagen,

                                resultado:
                                    imagen.resultado ||
                                    imagen.estado_uva ||
                                    "Pendiente",

                                confianza:
                                    imagen.confianza !== null
                                        ? imagen.confianza
                                        : null,

                                riesgo:
                                    imagen.riesgo ||
                                    "Pendiente",

                                modelo_cnn:
                                    imagen.modelo_cnn ||
                                    "Pendiente"

                            };

                        }

                    );


                console.log(
                    "📸 Imágenes con análisis y riesgo enviadas:",
                    datosFinales.length
                );


                return res.json(
                    datosFinales
                );

            }

        );

    }

);


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
// ENDPOINT CAPTURAR ESP32-CAM (CORREGIDO)
// =====================================================
// =====================================================
// RECIBIR Y ANALIZAR IMAGEN DESDE ESP32-CAM
// =====================================================

const ESP32_CAM_IP = process.env.ESP32_IP || 'http://172.20.10.2/capture';

app.post('/capturar-esp32', async (req, res) => {
    try {
        console.log('📸 Capturando imagen desde ESP32-CAM...');

        // 1. Obtener imagen de la cámara ESP32-CAM
        const response = await axios.get(ESP32_CAM_IP, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        // 2. Guardar imagen en disco local
        const nombreArchivo = `imagen-${Date.now()}.jpg`;
        const rutaArchivo = path.join(carpetaImagenes, nombreArchivo);
        fs.writeFileSync(rutaArchivo, imageBuffer);

        const rutaImagenFisica = path.resolve(rutaArchivo);

        // 3. Ejecutar modelo de Machine Learning
        analizarImagen(rutaImagenFisica, (errorModelo, resultadoModelo) => {
            if (errorModelo) {
                console.log("❌ Error del modelo:", errorModelo);
                return res.status(estadoErrorInferencia(errorModelo)).json({
                    mensaje: "Error analizando la imagen de ESP32",
                    error: errorModelo.message
                });
            }

            if (resultadoModelo.estadoDecision === "revision_manual") {
                return res.status(202).json(respuestaRevisionManual(
                    resultadoModelo,
                    nombreArchivo,
                    `/imagenes/${nombreArchivo}`
                ));
            }

            const resultadoBD = resultadoModelo.resultadoBD;
            const confianza = resultadoModelo.confianza;

            // 4. Buscar última medición registrada
            const sqlMedicion = `
                SELECT id_medicion, temperatura, humedad 
                FROM mediciones 
                ORDER BY fecha_hora DESC 
                LIMIT 1
            `;

            db.query(sqlMedicion, (err, resultadoMedicion) => {
                if (err) {
                    return res.status(500).json({ mensaje: "Error buscando última medición", error: err.message });
                }

                if (resultadoMedicion.length === 0) {
                    return res.status(400).json({ mensaje: "No existen mediciones registradas" });
                }

                const medicion = resultadoMedicion[0];
                const id_medicion = medicion.id_medicion;
                const temperatura = parseFloat(medicion.temperatura);
                const humedad = parseFloat(medicion.humedad);

                // 5. Calcular nivel de riesgo ambiental
                const riesgo = calcularRiesgo(temperatura, humedad, resultadoBD);
                const rutaImagen = `/imagenes/${nombreArchivo}`;

                // 6. Registrar en la tabla 'imagenes'
                const sqlImagen = `
                    INSERT INTO imagenes (id_medicion, ruta_imagen, estado_uva) 
                    VALUES (?, ?, ?)
                `;

                db.query(sqlImagen, [id_medicion, rutaImagen, resultadoBD], (err, resultadoImagen) => {
                    if (err) {
                        return res.status(500).json({ mensaje: "Error guardando imagen", error: err.message });
                    }

                    const id_imagen = resultadoImagen.insertId;

                    // 7. Registrar en la tabla 'analisis_imagen'
                    const sqlAnalisis = `
                        INSERT INTO analisis_imagen (id_imagen, modelo_cnn, resultado, confianza, riesgo) 
                        VALUES (?, ?, ?, ?, ?)
                    `;

                    db.query(sqlAnalisis, [id_imagen, resultadoModelo.modelo, resultadoBD, confianza, riesgo], (err) => {
                        if (err) {
                            return res.status(500).json({ mensaje: "Error guardando análisis", error: err.message });
                        }

                        // 8. Respuesta JSON exacta requerida por tu frontend (subirFoto)
                        return res.json({
                            mensaje: "Imagen ESP32 capturada, analizada y registrada correctamente",
                            resultado: resultadoBD,
                            confianza: confianza,
                            modelo: resultadoModelo.modelo,
                            ...detallesPublicosIA(resultadoModelo),
                            estado_uva: resultadoBD,
                            persistido: true,
                            riesgo: riesgo,
                            temperatura: temperatura,
                            humedad: humedad,
                            id_imagen: id_imagen,
                            id_medicion: id_medicion,
                            archivo: nombreArchivo,
                            ruta: rutaImagen
                        });
                    });
                });
            });
        });

    } catch (error) {
        console.error('❌ Error obteniendo captura de ESP32:', error.message);
        return res.status(500).json({
            mensaje: 'Error conectando con la ESP32-CAM',
            error: error.message
        });
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
