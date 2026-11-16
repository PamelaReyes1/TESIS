# Preparación para desplegar tesisPamela en hosting (Alwaysdata / cPanel)

## Estado de este paquete
- Se incluye código fuente Ionic/Angular, Node.js/Express y firmware.
- Se eliminaron `llaves.txt`, `probar-mysql.js`, imágenes capturadas y compilaciones antiguas.
- Se cambiaron las URLs locales del frontend por una configuración de entorno.
- Se añadió `npm start`, un endpoint `GET /health` y el host `IP` del proveedor Node.
- No se incluyen contraseñas reales ni `predecir_imagen.py` ni modelos entrenados: NO es un despliegue final funcional de IA.
- No están implementados autenticación, autorización, límites antiabuso para todos los endpoints ni un mecanismo de puente IoT: **no publicar el backend para acceso abierto hasta protegerlo**.

## 1) Antes de subir
- Identificar dónde tienes el hosting (hay indicios de Alwaysdata en archivos del proyecto original).
- Cambiar la contraseña MySQL si estaba expuesta.
- Crear frontend y API en dos sitios/subdominios HTTPS, por ejemplo:
  - `https://TUCUENTA.alwaysdata.net` (sitio estático, frontend)
  - `https://api-TUCUENTA.alwaysdata.net` (Node.js, backend)
- Verificar en el panel tu plan: Node.js, acceso SSH, MySQL, Python y memoria suficiente para IA.

## 2) Preparar Angular en tu PC (Windows PowerShell)
```powershell
cd telemetria-app
# Edita src/environments/environment.prod.ts con tu URL real de API HTTPS.
npm ci
npm run build -- --configuration production
```
El archivo `angular.json` del proyecto configura la salida en `telemetria-app/www/`.
**Subir el contenido** (no necesariamente la carpeta) a la raíz del sitio estático y añadir
`hosting/.htaccess` en esa raíz si Apache requiere reescritura de rutas.

## 3) Backend Node.js
- Sube `telemetria-iot` fuera de la raíz pública del sitio estático.
- Instala dependencias: `cd telemetria-iot && npm ci --omit=dev`
- En **Web > Sites** crea tipo **Node.js**; asigna una dirección distinta de la web.
- Comando típico Alwaysdata: `node /home/TUCUENTA/tesis/telemetria-iot/server.js`
- Configura las variables privadas en el panel: `FRONTEND_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PYTHON_PATH`, `SCRIPT_PATH`.
- Alwaysdata entrega `IP` y `PORT` por sitio; el servidor ahora respeta `process.env.IP`.
- Comprueba `https://TU_URL_API/health` → `{"status":"ok"}`.
- Comprueba `https://TU_URL_API/mediciones` → JSON con registros o lista vacía (si la BD está lista).

## 4) MySQL
- Si ya existe la BD de Alwaysdata, **NO** importes `sql/estructura_inicial.sql` sin revisar su esquema.
- Si creas una BD nueva, usa `sql/estructura_inicial.sql` para preparar 3 tablas.
- El usuario MySQL debe tener solo los privilegios necesarios y no usar root.
- Verifica que la base pueda conectarse desde el servidor y respalda periódicamente.

## 5) Predicción Python (BLOQUEADO hasta recibir código/modelo real)
- Agrega el verdadero `predecir_imagen.py` y su archivo de modelo entrenado.
- Crea un venv Python, instala el `requirements.txt` del clasificador real y configura `PYTHON_PATH`, `SCRIPT_PATH`.
- La salida del script debe conservar exactamente los patrones que parsea server.js:
  `Diagnóstico: ...`, `Confianza Analítica Global: NN%` y opcionalmente
  `Índice de Afectación del Racimo: NN%`.
- Ejecuta primero una prueba de predicción en SSH; después prueba POST `/imagenes-subir`.
- Algunas librerías como TensorFlow pueden requerir más RAM que la permitida en hosting compartido.

## 6) Sensores y cámara
- Los `.ino` de este ZIP envían telemetría y fotos por SERIAL, NO por Wi-Fi.
- Debes añadir un puente en la PC/Raspberry Pi local que lea Serial y transmita por HTTPS,
  o reprogramar firmware Wi-Fi.
- El endpoint `/capturar-esp32` intenta pedir una foto a una URL local por defecto:
  un hosting remoto no tiene acceso a esa IP privada. No publiques un endpoint que
  contacte URLs arbitrarias sin validación (riesgo SSRF).

## 7) Seguridad mínima pendiente antes de hacer público el backend
- Autenticación de usuarios para subir y gestionar imágenes.
- Credenciales IoT por dispositivo y autorización para POST `/mediciones` y captura.
- Validación del tamaño/tipo real de archivos, limitación de solicitudes y registro de errores.
- CORS restringido (ahora configurable por `FRONTEND_ORIGIN`, lo cual NO reemplaza la autenticación).
- HTTPS, acceso al almacenamiento solo necesario y backups.

## Pruebas de integración
1. `/health` contesta 200 y estado ok.
2. GET `/mediciones` devuelve JSON de la BD.
3. El frontend carga sin errores de red/CORS.
4. Las imágenes guardadas permanecen al reiniciar el servicio.
5. La inferencia genera un diagnóstico real con un modelo instalado.
6. El sensor envía telemetría sin exponer credenciales.
7. La captura de ESP32-CAM llega al backend mediante el puente/red configurados.

## Nota importante
Estos archivos se prepararon por inspección estática del proyecto. No se ha probado
el despliegue real ni la instalación npm/Python/MySQL contra un servidor de hosting.
