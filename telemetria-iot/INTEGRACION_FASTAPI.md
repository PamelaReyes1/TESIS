# Integración del backend telemetria-iot con FastAPI (Render)

Este paquete es una **copia modificada del ZIP entregado**. No actualiza por sí solo GitHub ni Render y no modifica el esquema MySQL.

## Qué cambió

- `server.js`: `analizarImagen(ruta, callback)` dejó de ejecutar un proceso Python local (`spawn`). Ahora usa `services/inferenceClient.js` para solicitar `POST /api/v1/predict` con `X-API-Key` y el archivo `file` en `multipart/form-data`.
- Mantiene las rutas `POST /imagenes-subir`, `/imagenes-directa`, `/inferencia`, `/capturar-esp32` y las rutas de telemetría/MySQL.
- El resultado del modelo se convierte a los estados que esperaba la base de datos:

  | Clase de FastAPI | estado_uva / resultado MySQL |
  | --- | --- |
  | Sano | Sana |
  | Pudricion leve | Con deterioro |
  | Pudricion Alta | Podrida |

- `modelo_cnn` se llena con el campo `modelo` que envía FastAPI; se eliminó el literal incorrecto `Random Forest`.
- `confianza` se mantiene como porcentaje **0–100** (equivalente a `confianza_pct` de FastAPI). Verificar que la columna MySQL admita esta escala.
- Se añadieron indicadores como `clase_propuesta`, `estado_decision`, `motivos_revision`, `probabilidades_pct` y `analisis_ia` a las respuestas. Se mantienen los campos existentes.

## Revisión manual y seguridad de datos

Cuando FastAPI devuelve `estado_decision: "revision_manual"`, la ruta de subida devuelve **HTTP 202** con la clase propuesta, los motivos, el archivo y `persistido: false`. **No inserta** una clasificación no confirmada en `imagenes` ni en `analisis_imagen`, ya que el esquema que vimos solo utiliza `Sana`, `Con deterioro` y `Podrida`. Para conservar pendientes de manera duradera en MySQL, habrá que añadir una tabla/flujo de revisión y actualizar el frontend.

`/inferencia` mantiene comportamiento temporal: la imagen se elimina después de consultar FastAPI y la respuesta incluye la revisión si corresponde.

**Importante:** el frontend debe manejar `HTTP 202` mostrando “Revisión manual” sin esperar un `id_imagen` confirmado. El archivo en disco no es persistencia confiable en hosting efímero; la ruta `ruta` podrá dejar de existir tras un reinicio. Para almacenar fotos de forma duradera será necesario un bucket/disco persistente.

## Variables para el backend Node.js

En el hosting del backend actual (Render, alwaysdata, etc.), configurar como secretas:

```env
INFERENCE_API_URL=https://servicio-ia-uvas.onrender.com
INFERENCE_API_KEY=LA_MISMA_CLAVE_DEL_INFERENCE_API_KEY_DE_FASTAPI
INFERENCE_TIMEOUT_MS=180000
INFERENCE_MAX_IMAGE_BYTES=8388608
```

Mantener las variables `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` y `FRONTEND_ORIGIN` como estaban. No copiar `HF_TOKEN` al backend Node.js: solo necesita la clave de FastAPI.

El servidor requiere **Node.js >= 20** para usar `fetch`, `FormData` y `Blob` nativos. No se agregaron dependencias externas nuevas.

## Actualizar el backend

1. Respaldar el backend desplegado (especialmente las variables privadas).
2. Copiar sobre el repositorio existente `server.js`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore` y las carpetas `services/`, `tests/`. No reemplazar valores reales de `.env` por ejemplos.
3. Configurar las variables nuevas en el panel de hosting de **Node.js**.
4. Ejecutar `npm ci` y `npm test` si hay un entorno de CI; no se necesita WSL para publicar.
5. `git add . && git commit -m "feat: consumir microservicio FastAPI de uvas" && git push` desde tu repositorio (o hacer upload mediante GitHub web).
6. Realizar despliegue del backend Node.js; no se necesita volver a desplegar FastAPI si su API no cambió.

## Pruebas y respuestas esperadas

- `GET /health` del backend Node.js debe continuar respondiendo `{ "status": "ok" }`.
- `POST /imagenes-subir` recibe `multipart/form-data` con campo **`imagen`**, como antes. El backend reenvía a FastAPI con campo **`file`** (la diferencia es intencional).
- `POST /imagenes-directa` y `/inferencia` reciben cuerpo binario con `Content-Type: image/jpeg`.
- `POST /capturar-esp32` sigue dependiendo de `ESP32_IP`. Una IP de LAN no es accesible automáticamente desde un servicio en la nube.
- **200:** análisis aceptado y persistido (cuando la ruta requiere inserción y MySQL está disponible).
- **202:** análisis con revisión manual; sin inserción definitiva en MySQL.
- **413/415/422:** imagen inválida o demasiado grande.
- **502:** error de servicio IA, autenticación incorrecta entre servicios o respuesta inesperada.
- **504:** espera agotada, por ejemplo por activación de la instancia gratuita de Render.

La `INFERENCE_API_KEY` no debe aparecer en respuestas, código fuente, GitHub ni en el navegador. Las pruebas unitarias usan un servidor de prueba simulado; **no se han verificado accesos a MySQL de producción ni a la API real**.
