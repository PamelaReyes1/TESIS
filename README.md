# Tesis Pamela — Sistema de telemetría y clasificación de imágenes

Proyecto académico compuesto por:

- **`telemetria-app/`** — aplicación Ionic/Angular (frontend, desplegable como sitio estático en Render).
- **`telemetria-iot/`** — API Node.js/Express y conexión a MySQL.
- **`esp32_cam/` y `nodemcu_dht11/`** — firmware para dispositivos IoT.
- **`sql/`** — propuesta de esquema inicial de base de datos (revisar antes de aplicarlo).
- **`GUIA_DESPLIEGUE.md`** — advertencias y pasos de instalación.

## Estado de la aplicación

Este repositorio contiene una **preparación inicial para despliegue**, no el sistema completo operando en producción. Faltan el script de predicción `predecir_imagen.py`, el modelo entrenado y la conexión IoT remota. El backend no debe exponerse públicamente sin controles de autenticación, autorización y protección de las cargas.

## Ejecutar frontend localmente

```bash
cd telemetria-app
npm ci
npm start
```

Para compilar el frontend para Render, actualiza primero la URL real de la API en `src/environments/environment.prod.ts` y ejecuta:

```bash
cd telemetria-app
npm ci
npm run build -- --configuration production
```

La salida configurada está en `telemetria-app/www/`.

## Ejecutar backend localmente (después de configurar la base de datos)

```bash
cd telemetria-iot
cp .env.example .env  # En Windows, copia este archivo desde PowerShell o Explorador
npm ci
npm start
```

El fichero `.env` contiene credenciales privadas y **no debe confirmarse en Git**. Para variables de despliegue, usa los secretos del proveedor.

## Publicación de frontend en Render

- Tipo: **Static Site**
- Root Directory: `telemetria-app`
- Build Command: `npm ci && npm run build -- --configuration production`
- Publish Directory: `www`
- Regla de rutas Angular: Rewrite `/*` → `/index.html`

**Importante:** El frontend publicado requiere una API accesible públicamente por HTTPS; subir solo la interfaz no hace funcionar las mediciones, las imágenes o las predicciones.
