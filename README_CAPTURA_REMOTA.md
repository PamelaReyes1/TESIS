# TESIS PAMELA — ESP32-CAM: una fotografía solo al pulsar «Tomar foto»

## Qué cambia

- **No hay capturas automáticas ni envíos cada cinco minutos.** La ESP32-CAM consulta órdenes en Render cada 10 segundos, pero **NO toma ni envía fotografías** si no existe una orden pendiente.
- Al pulsar **«Tomar foto con ESP32-CAM»** en Ionic, el backend guarda una orden en MariaDB (`ordenes_captura_esp32`).
- ESP32-CAM consulta `GET /esp32/orden-pendiente` por HTTPS, se autentica con `IOT_CAMARA_KEY`, recibe el ID de la orden, toma **una** fotografía y la sube a `POST /imagenes-directa` con `X-Capture-Id`.
- Node.js llama a FastAPI/ EfficientNetB0, guarda el JPEG y su diagnóstico en MariaDB, marca la orden como `completada`, e Ionic actualiza historial y resultado.
- Una orden no puede usarse dos veces. Las fallidas y vencidas liberan la posibilidad de pedir otra.
- Se conservan el DHT11, el endpoint `POST /mediciones`, las fotografías manuales (`/imagenes-subir`), los diagnósticos y el historial.
- `http://esp32cam.local/capture` sigue disponible **solo para pruebas locales**; muestra un JPEG en la LAN sin subirlo a Render. Se elimina `/enviar` para evitar subidas fuera del botón web.

## Archivos incluidos

```text
telemetria-iot/server.js
telemetria-iot/migrations/2026_11_esp32_captura_remota.sql
telemetria-iot/tests/capturaRemota.test.js
telemetria-app/src/app/services/telemetria.ts
telemetria-app/src/app/home/home.page.ts
telemetria-app/src/app/home/home.page.html
firmware/ESP32CAM_Remota/ESP32CAM_Remota.ino
firmware/ESP32CAM_Remota/certificados_render.h
README_CAPTURA_REMOTA.md
```

## Instalación — sigue este orden

### 1. Respaldar

Haz una copia de `telemetria-iot/server.js`, `telemetria-app/src/app/home/` y `telemetria-app/src/app/services/telemetria.ts` antes de reemplazar. El paquete parte de las versiones más recientes que preparamos juntos (IoT autenticado y frontend con actualización automática), no necesariamente de cambios nuevos que hayas hecho localmente.

### 2. MariaDB (OBLIGATORIO ANTES DE PUBLICAR)

En phpMyAdmin -> base `danieltesis_pame` -> pestaña SQL, ejecuta **una sola vez** el archivo:

`telemetria-iot/migrations/2026_11_esp32_captura_remota.sql`

Este script crea solo la tabla `ordenes_captura_esp32` y **no modifica** `imagenes`, `analisis_imagen`, `sensores` ni `mediciones`.

Comprobación:

```sql
SHOW TABLES LIKE 'ordenes_captura_esp32';
DESCRIBE ordenes_captura_esp32;
```

### 3. Reemplazar backend y frontend

Extrae el ZIP en la carpeta principal `C:\Users\ASUS\Desktop\tesisPamela-github\`, aceptando sobrescribir las rutas `telemetria-iot/...` y `telemetria-app/...` indicadas. La carpeta `firmware` puede quedar allí como copia de trabajo (puedes moverla a otra computadora para programar la placa).

El NodeMCU **NO se modifica**. Continúa enviando temperatura y humedad como lo hace actualmente.

### 4. Compilar y publicar

CMD (desde la raíz del repositorio):

```cmd
node --check telemetria-iot\server.js
cd telemetria-iot
node --test
cd ..\telemetria-app
npm install
npm run build
cd ..
git add telemetria-iot/server.js telemetria-iot/migrations/2026_11_esp32_captura_remota.sql telemetria-iot/tests/capturaRemota.test.js telemetria-app/src/app/services/telemetria.ts telemetria-app/src/app/home/home.page.ts telemetria-app/src/app/home/home.page.html
git commit -m "feat(iot): captura esp32 solo bajo demanda desde Ionic"
git push origin main
```

Comprueba que Render terminó de desplegar **backend y frontend** sin errores. `FRONTEND_ORIGIN` en el backend debe contener `https://tesis-pamela.onrender.com` (como ya se configuró antes). No cambies `IOT_NODEMCU_KEY` ni `IOT_CAMARA_KEY` en Render si siguen funcionando.

### 5. Grabar nuevo firmware de ESP32-CAM

En Arduino IDE abre `firmware/ESP32CAM_Remota/ESP32CAM_Remota.ino`.

**IMPORTANTE**: rellena `WIFI_SSID`, `WIFI_PASSWORD` y `DEVICE_KEY` con los **mismos valores privados que ya utilizas** en tu placa, sin publicarlos ni incluirlos en Git. Mantén `certificados_render.h` al lado del `.ino`; contiene certificados públicos, no contraseñas.

Selecciona **AI Thinker ESP32-CAM** en Arduino IDE. Para cargar con adaptador USB-TTL, sigue el mismo procedimiento anterior: GPIO0 a GND **solo durante programación**; al terminar, quita el puente y reinicia la placa. Comprueba el Monitor serie a 115200 baudios.

Este firmware *no* tiene `ENVIO_AUTOMATICO` ni `GET /enviar`. La cámara consulta la nube periódicamente sin tomar fotos mientras no haya orden.

### 6. Probar

1. Abre la web `https://tesis-pamela.onrender.com` y el Monitor serie de ESP32-CAM.
2. Sin pulsar el botón, comprueba que no aparece ninguna línea `JPEG ... subiendo a Render...` ni ningún nuevo registro en el historial. Es normal que la cámara consulte en silencio cada ~10 segundos.
3. Pulsa **«📷 Tomar foto con ESP32-CAM»** una sola vez.
4. En el Monitor serie deberías ver `Orden remota #1 recibida. Capturando...`, `JPEG de ... bytes; subiendo a Render...`, `HTTP /imagenes-directa: 201` o `202`.
5. Ionic debe mostrar el estado de procesamiento y luego la nueva foto, su diagnóstico o la revisión manual. Revisa también `https://api-tesis-pamela.onrender.com/imagenes/`.

### Diagnóstico de errores

- **403 al pulsar**: comprueba `FRONTEND_ORIGIN` en Render y usa el dominio publicado correcto. `Origin` evita invocaciones casuales entre sitios, pero **no es autenticación real**.
- **500 al pulsar**: comprueba que ejecutaste la migración SQL sobre la base de datos de Render.
- **409 al pulsar**: ya hay una orden activa. Espera a que termine o venza.
- **401 en Monitor serie**: `DEVICE_KEY` de la cámara no coincide con `IOT_CAMARA_KEY` de Render.
- **502 al enviar foto**: FastAPI falló o no respondió; el frontend mostrará captura fallida y puedes repetir.
- **No llega ninguna orden**: verifica Wi-Fi, hora NTP, certificado TLS, URL `/esp32/orden-pendiente` y que el firmware nuevo esté cargado.
- **HTTP 201/202**: fotografía y diagnóstico guardados correctamente.

## Nota de seguridad importante

El frontend actual no tiene autenticación de usuarios. El backend restringe el origen HTTP de la solicitud de captura, pero **el encabezado Origin puede falsificarse desde otro cliente**. Por eso este mecanismo es adecuado para pruebas controladas de tesis, no para exponer control remoto de una cámara en producción. Antes del uso real con usuarios, se debe proteger `POST /capturar-esp32` con inicio de sesión y permisos de operador; las claves IoT nunca deben enviarse al navegador. Cada fotografía solo se recibe si existe una orden activa, pero no podemos garantizar que toda orden sea emitida por un usuario autorizado hasta implementar autenticación.

**No uses esta migración para habilitar vinculación automática con mediciones.** La relación imagen-medición sigue siendo opcional, tal como la dejamos antes.

## Validación del paquete

Se ejecutaron `node --check` y pruebas de rutas con mocks de base de datos (5 pruebas correctas), además de verificación de sintaxis TypeScript. **No se ha ejecutado una compilación completa de Angular ni una compilación/flasheo de Arduino IDE en las placas físicas** desde este entorno. Estas pruebas deben hacerse localmente antes de desplegar.
