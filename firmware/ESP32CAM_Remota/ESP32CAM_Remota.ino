// ESP32-CAM AI THINKER / OV2640 -> NODE.JS EN RENDER POR HTTPS
// Captura SOLO por orden remota consultada a Render.
// GET /capture queda SOLO para pruebas LAN y nunca sube a la nube.

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <stdlib.h>
#include "certificados_render.h"

// -------- CAMBIA ESTOS DATOS ANTES DE GRABAR --------
const char* WIFI_SSID = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_CLAVE_WIFI_NUEVA";
// Solo tiene efecto si Node.js valida este encabezado.
const char* DEVICE_KEY = "";
// ---------------------------------------------------

const char* URL_IMAGEN = "https://api-tesis-pamela.onrender.com/imagenes-directa";
// No hay envios automaticos. Consultar ordenes de captura cada 10 segundos.
const char* URL_ORDEN = "https://api-tesis-pamela.onrender.com/esp32/orden-pendiente";
const char* URL_ORDEN_FALLIDA = "https://api-tesis-pamela.onrender.com/esp32/orden-fallida";
const unsigned long INTERVALO_ORDEN_MS = 10000UL;
const unsigned long TIMEOUT_WIFI_MS = 25000UL;

// Pines de ESP32-CAM AI THINKER (sin archivo camera_pins.h externo).
#define PWDN_GPIO_NUM  32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM   0
#define SIOD_GPIO_NUM  26
#define SIOC_GPIO_NUM  27
#define Y9_GPIO_NUM    35
#define Y8_GPIO_NUM    34
#define Y7_GPIO_NUM    39
#define Y6_GPIO_NUM    36
#define Y5_GPIO_NUM    21
#define Y4_GPIO_NUM    19
#define Y3_GPIO_NUM    18
#define Y2_GPIO_NUM     5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM  23
#define PCLK_GPIO_NUM  22

WebServer server(80);
unsigned long ultimaConsultaOrden = 0;

bool conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando Wi-Fi");
  const unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < TIMEOUT_WIFI_MS) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No se pudo conectar al Wi-Fi");
    return false;
  }
  Serial.print("ESP32-CAM IP local: ");
  Serial.println(WiFi.localIP());
  return true;
}

bool horaSincronizada() {
  if (time(nullptr) > 1700000000) return true;
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const unsigned long inicio = millis();
  while (time(nullptr) < 1700000000 && millis() - inicio < 20000UL) {
    delay(500);
  }
  return time(nullptr) > 1700000000;
}

bool iniciarCamara() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  const esp_err_t resultado = esp_camera_init(&config);
  if (resultado != ESP_OK) {
    Serial.printf("Error iniciando camara: 0x%x\n", resultado);
    return false;
  }
  Serial.println("Camara iniciada correctamente");
  return true;
}

// Ruta local: http://esp32cam.local/capture (solo desde la LAN).
void handleCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "No fue posible capturar");
    return;
  }
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  WiFiClient cliente = server.client();
  const size_t escritos = cliente.write(fb->buf, fb->len);
  Serial.printf("Foto local: %u/%u bytes\n", (unsigned)escritos, (unsigned)fb->len);
  esp_camera_fb_return(fb);
}

// Solicita una orden a Render; "0" significa que no hay que capturar.
// Solo consulta por HTTPS con X-Device-Key. Ninguna captura automatica.
unsigned long consultarOrdenRemota() {
  if (!conectarWifi() || !horaSincronizada()) return 0;

  WiFiClientSecure cliente;
  cliente.setCACert(CLOUD_ROOT_CA);
  HTTPClient http;
  http.setConnectTimeout(15000);
  http.setTimeout(15000);
  if (!http.begin(cliente, URL_ORDEN)) return 0;
  http.addHeader("X-Device-Key", DEVICE_KEY);
  const int codigo = http.GET();
  unsigned long idOrden = 0;
  if (codigo == 200) {
    String texto = http.getString();
    texto.trim();
    // La respuesta es un entero en texto plano, no JSON.
    if (texto.length() && texto.length() <= 18) {
      const unsigned long id = strtoul(texto.c_str(), nullptr, 10);
      if (id > 0) idOrden = id;
    }
  } else {
    Serial.printf("HTTP consulta de orden: %d\n", codigo);
  }
  http.end();
  return idOrden;
}

void reportarFalloCaptura(unsigned long idOrden) {
  if (!conectarWifi() || !horaSincronizada()) return;
  WiFiClientSecure cliente;
  cliente.setCACert(CLOUD_ROOT_CA);
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(cliente, URL_ORDEN_FALLIDA)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  const String json = String("{\"id_orden\":") + String(idOrden) + "}";
  const int codigo = http.POST(json);
  Serial.printf("HTTP informando fallo de captura: %d\n", codigo);
  http.end();
}

void enviarFotoNube(unsigned long idOrden) {
  if (!conectarWifi() || !horaSincronizada()) {
    Serial.println("Sin Wi-Fi o NTP: no se pudo enviar la foto");
    return;
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("No se pudo capturar foto para la nube");
    reportarFalloCaptura(idOrden);
    return;
  }

  Serial.printf("JPEG de %u bytes; subiendo a Render...\n", (unsigned)fb->len);
  WiFiClientSecure cliente;
  cliente.setCACert(CLOUD_ROOT_CA);
  HTTPClient http;
  http.setConnectTimeout(20000);
  http.setTimeout(65000); // HTTPClient admite como maximo 65535 ms

  if (!http.begin(cliente, URL_IMAGEN)) {
    Serial.println("No se pudo preparar POST HTTPS");
    esp_camera_fb_return(fb);
    return;
  }
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Capture-Id", String(idOrden));
  if (strlen(DEVICE_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_KEY);
  }

  const int codigo = http.POST(fb->buf, fb->len);
  Serial.printf("HTTP /imagenes-directa: %d\n", codigo);
  if (codigo > 0) {
    const String respuesta = http.getString();
    Serial.println(respuesta.substring(0, 900));
    if (codigo == 200 || codigo == 201 || codigo == 202) {
      Serial.println("Solicitud aceptada; revisar persistido e id_imagen en JSON");
    }
  } else {
    Serial.println(http.errorToString(codigo));
  }
  http.end();
  esp_camera_fb_return(fb);
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println("\nESP32-CAM -> Render");
  if (!iniciarCamara()) {
    Serial.println("Revise la placa AI Thinker y los pines");
    return;
  }
  conectarWifi();
  if (WiFi.status() == WL_CONNECTED) {
    horaSincronizada();
    if (MDNS.begin("esp32cam")) {
      Serial.println("Prueba local: http://esp32cam.local/capture");
      Serial.println("La camara solo enviara con la orden del boton Ionic.");
    }
  }
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/plain", "ESP32-CAM activa, esperando ordenes HTTPS");
  });
  server.on("/capture", HTTP_GET, handleCapture);
  server.begin();
  Serial.println("Servidor local de camara listo");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) server.handleClient();
  else conectarWifi();

  if (millis() - ultimaConsultaOrden >= INTERVALO_ORDEN_MS) {
    ultimaConsultaOrden = millis();
    const unsigned long idOrden = consultarOrdenRemota();
    if (idOrden > 0) {
      Serial.printf("Orden remota #%lu recibida. Capturando...\n", idOrden);
      enviarFotoNube(idOrden);
    }
  }
  delay(25);
}
