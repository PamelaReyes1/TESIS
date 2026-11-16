
#include "esp_camera.h"

// =====================================================
// 1. PINES ESP32-CAM AI THINKER
// =====================================================

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM      35
#define Y8_GPIO_NUM      34
#define Y7_GPIO_NUM      39
#define Y6_GPIO_NUM      36
#define Y5_GPIO_NUM      21
#define Y4_GPIO_NUM      19
#define Y3_GPIO_NUM      18
#define Y2_GPIO_NUM       5

#define VSYNC_GPIO_NUM   25
#define HREF_GPIO_NUM    23
#define PCLK_GPIO_NUM    22

// =====================================================
// 2. CONFIGURACIÓN
// =====================================================

const unsigned long INTERVALO_FOTOS = 30000;

unsigned long ultimaFoto = 0;
bool camaraLista = false;

// =====================================================
// 3. CAPTURAR Y ENVIAR FOTOGRAFÍA POR SERIAL
// =====================================================

void tomarFoto() {

  if (!camaraLista) {
    return;
  }

  camera_fb_t *fb = esp_camera_fb_get();

  if (fb == NULL) {
    Serial.println("ERROR_CAMARA");
    return;
  }

  // Indicar el tamaño de la imagen
  Serial.print("FOTO_INICIO:");
  Serial.println(fb->len);

  // Enviar los bytes JPEG completos
  size_t enviados = Serial.write(
    fb->buf,
    fb->len
  );

  Serial.flush();

  esp_camera_fb_return(fb);

  if (enviados != fb->len) {
    // No enviar mensajes adicionales aquí:
    // Python comprobará el tamaño recibido.
  }
}

// =====================================================
// 4. CONFIGURAR CÁMARA
// =====================================================

void setup() {

  Serial.begin(115200);
  Serial.setDebugOutput(false);

  delay(1000);

  Serial.println();
  Serial.println("INICIANDO_ESP32_CAM");

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

  // Captura JPEG
  config.pixel_format = PIXFORMAT_JPEG;

  // Resolución VGA: 640 x 480
  config.frame_size = FRAMESIZE_VGA;

  // Calidad JPEG: menor número = mayor calidad
  config.jpeg_quality = 12;

  // Un búfer para reducir uso de memoria
  config.fb_count = 1;

  // Inicializar cámara
  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {

    Serial.printf(
      "ERROR_INICIALIZACION:0x%x\n",
      err
    );

    return;
  }

  camaraLista = true;

  Serial.println("CAMARA_LISTA");

  // Primera foto inmediatamente al iniciar
  ultimaFoto = millis() - INTERVALO_FOTOS;
}

// =====================================================
// 5. CAPTURA AUTOMÁTICA CADA 30 SEGUNDOS
// =====================================================

void loop() {

  if (!camaraLista) {
    delay(1000);
    return;
  }

  unsigned long ahora = millis();

  if (ahora - ultimaFoto >= INTERVALO_FOTOS) {

    ultimaFoto = ahora;

    tomarFoto();
  }

  delay(10);
}
