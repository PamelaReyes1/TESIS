# Backend de tesis: recepción IoT autenticada (NodeMCU y ESP32-CAM)

**Archivo principal para reemplazar:** `telemetria-iot/server.js`.

Este paquete modifica la versión `diagnosticos_mysql_sin_sensor_v2` de la tesis, preservando:
- `POST /imagenes-subir` (Ionic, fotografías manuales)
- `GET /imagenes`, `GET /imagenes/db/:id` (historial desde MariaDB)
- `POST /imagenes-directa` (ESP32-CAM: JPEG binario)
- `POST /mediciones`, `GET /mediciones`, `GET /medicion-actual` (NodeMCU)
- `POST /inferencia`, `POST /capturar-esp32` y `/health`
- El comportamiento de revisión manual de EfficientNetB0 y la persistencia de fotos sin sensor.

## Pasos

1. **Respalda el `server.js` actual** en tu copia local del repositorio.
2. Extrae el ZIP **en la carpeta raíz del repositorio** (donde está el subdirectorio `telemetria-iot`), permitiendo reemplazar `telemetria-iot/server.js`. La ruta `telemetria-iot/tests/iotDeviceAuth.test.js` es una prueba adicional.
3. En Render, servicio `api-tesis-pamela` > **Environment**, agrega las variables privadas:
   - `IOT_NODEMCU_KEY` = una clave aleatoria de **al menos 32 caracteres**.
   - `IOT_CAMARA_KEY` = otra clave aleatoria, distinta, de **al menos 32 caracteres**.
   **No las coloques en Git ni en el frontend.** Sin ellas, los POST de dispositivos devolverán HTTP 503 por seguridad.
4. En el firmware NodeMCU y ESP32-CAM, escribe la clave correspondiente en la variable `DEVICE_KEY` y **vuelve a cargar los programas**. Los programas enviados anteriormente ya envían la cabecera `X-Device-Key` cuando `DEVICE_KEY` no está vacía. Utiliza Wi-Fi y HTTPS con validación TLS.
5. En MariaDB comprueba `SELECT id_sensor,codigo,tipo FROM sensores;`. Si no aparece el DHT11, regístralo **una sola vez** (la tabla `sensores` debe existir). Configura en el firmware el `ID_SENSOR` real, no asumas que vale 1.
6. Desde la raíz del repositorio ejecuta, en CMD de Windows:

   ```cmd
   node --check telemetria-iot\server.js
   cd telemetria-iot
   node --test tests\*.test.js
   cd ..
   git add telemetria-iot/server.js telemetria-iot/tests/iotDeviceAuth.test.js
   git commit -m "feat(iot): recibir sensores y fotos con autenticacion"
   git push origin main
   ```

   Revisa que Render despliegue correctamente.

## Contratos recibidos

### `POST /mediciones` (DHT11)

Cabeceras: `Content-Type: application/json` y `X-Device-Key: <clave privada de NodeMCU>`.

```json
{"id_sensor":1,"temperatura":26.5,"humedad":72.3}
```

- `200` = medición insertada, con `id` generado.
- `400` = datos ausentes, inválidos o fuera de rango.
- `401` = clave incorrecta o ausente.
- `422` = `id_sensor` sin fila en la tabla `sensores` (si hay restricción de clave foránea).
- `503` = clave privada no configurada (o demasiado corta) en Render.

### `POST /imagenes-directa` (ESP32-CAM)

Cabeceras: `Content-Type: image/jpeg` y `X-Device-Key: <clave privada de cámara>`. Cuerpo: bytes JPEG, máximo 8 MiB.

- `201` = fotografía y diagnóstico aceptado, guardados.
- `202` = fotografía y evaluación guardadas; revisión manual pendiente.
- `401` = clave incorrecta o ausente.
- `502` = FastAPI/IA no respondió correctamente (revisar logs de FastAPI).

**Nota:** `POST /capturar-esp32` aún usa una URL de red local y no puede capturar remotamente desde Render sin un mecanismo adicional de órdenes. La ESP32-CAM sí puede **enviar** las fotos a `/imagenes-directa`. El cambio no modifica cómo se lanza la captura desde Ionic.

## Alcance y compatibilidad

- No cambia el esquema SQL, dependencias de Node, frontend ni IA.
- No es necesario reinstalar `node_modules` si tu backend ya ejecuta la versión `diagnosticos_mysql_sin_sensor_v2` con `services/inferenceClient.js` y `services/diagnosticosRepository.js`.
- Se ha comprobado la sintaxis y ejecutado **10 pruebas locales** (incluidas pruebas simuladas de autenticación y persistencia). No se ha desplegado en Render ni probado contra dispositivos físicos.
- Este ZIP fue construido a partir del último paquete v2 compartido; si cambiaste `server.js` después, **compara con tu versión antes de sobrescribir** para no perder modificaciones más recientes.
