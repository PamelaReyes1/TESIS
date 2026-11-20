# Actualización incremental del frontend IoT en Render

Version basada en `frontend-ionic-conectado-render.zip` compartido previamente.

## Copiar (sin reemplazar el proyecto completo)

Copiar **solo** estos archivos a sus rutas equivalentes dentro del repositorio `tesisPamela-github/telemetria-app/`:

- `src/app/services/telemetria.ts`: GET `/imagenes/` sin 301, GET `/mediciones` y subida manual preservados.
- `src/app/home/home.page.ts`: elige medición con mayor ID, actualiza imágenes cada 30 s y mediciones cada 10 s.
- `src/app/home/home.page.html`: historial con `revision_manual`, información ambiental sin atribuir lecturas ajenas a las fotografías; cambia el botón roto de captura remota por actualización del historial.
- `src/app/home/home.page.scss`: estilos mínimos complementarios.

No cambia tu backend, la API de FastAPI, el `environment` ni las tablas de MariaDB.

## Probar y publicar

En CMD, ubicado en el directorio principal del repo:

```bat
cd telemetria-app
npm install
npm run build
cd ..
git add telemetria-app/src/app/services/telemetria.ts telemetria-app/src/app/home/home.page.ts telemetria-app/src/app/home/home.page.html telemetria-app/src/app/home/home.page.scss
git commit -m "fix(frontend): actualizar telemetria e historial IoT en nube"
git push origin main
```

## Limitación

La ESP32-CAM sube fotografías al backend automáticamente o cuando se llama `/enviar` dentro de su LAN. El backend en Render **no puede** acceder a `esp32cam.local` o IPs `192.168.*`. El viejo endpoint `/capturar-esp32` NO ordena de forma remota la captura. Se debe implementar posteriormente una cola de comandos autenticada si se quiere activar el obturador desde Ionic en Internet.

## Seguridad

No colocar `IOT_NODEMCU_KEY` ni `IOT_CAMARA_KEY` en archivos del frontend: JavaScript del navegador es público. Las claves deben quedar solo en Render y en firmware privado.
