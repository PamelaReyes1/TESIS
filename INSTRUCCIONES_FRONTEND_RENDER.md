# Conexión del frontend Ionic/Angular con Render

Código preparado sobre el frontend `telemetria-app` de la copia de tesis previamente compartida. **No sustituye todo el repositorio**, sino cinco archivos actuales.

## Archivos para copiar a `C:\Users\ASUS\Desktop\tesisPamela-github`

Copiar conservando sus rutas:

- `telemetria-app/src/environments/environment.ts`
- `telemetria-app/src/environments/environment.prod.ts`
- `telemetria-app/src/app/home/home.page.ts`
- `telemetria-app/src/app/home/home.page.html`
- `telemetria-app/src/app/home/home.page.scss`

**No copiar `.env`, tokens ni claves al frontend.** No hay cambios en el backend Node.js, FastAPI ni el servicio `telemetria.ts` porque este ya consume `environment.apiUrl` y envía la imagen correctamente con el campo `imagen`.

## Qué se corrigió

- `environment.ts` y `environment.prod.ts` apuntan a `https://api-tesis-pamela.onrender.com`.
- Al recibir `202 Accepted` con `estado_decision=revision_manual`, el frontend presenta 'Revisión manual' y `clase_propuesta`, incluso si `resultado` viene `null`.
- El riesgo queda 'Pendiente' en una revisión manual; no se presenta como 'Bajo'.
- Los errores de red/HTTP son visibles para el usuario y se rechazan imágenes de más de 8 MB antes de enviarlas.
- Las rutas existentes (`/imagenes`, `/mediciones`, `/imagenes-subir`, `/capturar-esp32`) y el diseño general se mantienen.

## CORS: configurar en el backend Node.js de Render

En Render -> `api-tesis-pamela` -> Environment, establece o amplía **`FRONTEND_ORIGIN`** con el origen exacto desde donde se abrirá el frontend. Para pruebas locales con Ionic CLI y Angular:

```env
FRONTEND_ORIGIN=http://localhost:8100,http://localhost:4200
```

Si publicas el frontend, agrega su dirección **sin barra final** a la lista separada por comas, por ejemplo:

```env
FRONTEND_ORIGIN=http://localhost:8100,http://localhost:4200,https://TU-FRONTEND.onrender.com
```

No borres ningún origen de producción que ya exista. `FRONTEND_ORIGIN` es una lista de orígenes y no debe contener `/health`, `/imagenes-subir` ni rutas.

Puedes revisar la cabecera CORS en CMD con:

```cmd
curl.exe -i -H "Origin: http://localhost:8100" "https://api-tesis-pamela.onrender.com/health"
```

Si está configurado, la respuesta debe incluir `Access-Control-Allow-Origin: http://localhost:8100`. Una petición curl exitosa sin `Origin` **no prueba que el navegador tenga permiso CORS**.

## Levantar localmente el frontend con backend remoto

Desde CMD:

```cmd
cd /d "C:\Users\ASUS\Desktop\tesisPamela-github\telemetria-app"
npm ci
npm start
```

`npm start` (Angular) suele abrir `http://localhost:4200`. Alternativamente, si tienes Ionic CLI instalado, `ionic serve` suele abrir `http://localhost:8100`. El backend, en ambos casos, permanece alojado en Render; no se inicia Node.js ni FastAPI localmente.

## Publicar el frontend en Render (opcional)

Crear `New -> Static Site` (no Web Service) conectado a `PamelaReyes1/TESIS`, `main`.

- Root Directory: `telemetria-app`
- Build Command: `npm ci && npm run build`
- Publish Directory: `www`
- Para rutas Angular distintas de `/`, crear una Rewrite `/*` -> `/index.html` si Render lo requiere.

Después agrega el origen real del Static Site a `FRONTEND_ORIGIN` en el backend Node.js y guarda para redesplegar. El frontend se actualiza con commits de GitHub si el autodeploy está activo.

## Subir cambios al GitHub de la tesis

```cmd
cd /d "C:\Users\ASUS\Desktop\tesisPamela-github"
git status --short
git add telemetria-app/src/environments/environment.ts telemetria-app/src/environments/environment.prod.ts telemetria-app/src/app/home/home.page.ts telemetria-app/src/app/home/home.page.html telemetria-app/src/app/home/home.page.scss
git commit -m "feat(frontend): conectar Ionic con API Render y gestionar revision manual"
git push origin main
```

Los cambios de frontend no son suficientes para probar guardados en MySQL: primero hace falta una fotografía con diagnóstico `aceptada` y conexión real con la base de datos. Asimismo, `/capturar-esp32` requiere conectividad del backend remoto hacia la cámara; no puede acceder por sí solo a una IP de red privada.

## Seguridad

La clave `INFERENCE_API_KEY` se compartió anteriormente en texto; **rótala en ambos servicios Render** (`servicio-ia-uvas` y `api-tesis-pamela`) si no lo hiciste. Nunca incluyas claves en los archivos `environment.*.ts` ni en el frontend.

## Verificación

- `GET https://api-tesis-pamela.onrender.com/health` -> HTTP 200.
- Elegir fotografía de hasta 8 MB y pulsar 'Analizar imagen'.
- La fotografía de prueba conocida debe mostrar un estado 'Revisión manual' (202) y no un diagnóstico definitivo.
- La consola del navegador (F12 -> Network) debe mostrar `POST .../imagenes-subir` y la respuesta 202, no `status: 0`.
- Si muestra `status: 0`, revisar CORS y URL, no modificar la API key del navegador.
