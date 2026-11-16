
#include <DHT.h>

// ==========================================
// 1. CONFIGURACIÓN DEL SENSOR DHT11
// ==========================================

#define DHTPIN D4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// ==========================================
// 2. CONFIGURACIÓN
// ==========================================

// Medición cada 2 segundos
const unsigned long INTERVALO = 2000;

unsigned long ultimaLectura = 0;

// ==========================================
// 3. INICIALIZACIÓN
// ==========================================

void setup() {

  Serial.begin(115200);

  dht.begin();

  delay(2000);

  Serial.println("SENSOR_LISTO");

  ultimaLectura = millis() - INTERVALO;
}

// ==========================================
// 4. LECTURA DE TEMPERATURA Y HUMEDAD
// ==========================================

void loop() {

  unsigned long ahora = millis();

  if (ahora - ultimaLectura >= INTERVALO) {

    ultimaLectura = ahora;

    float temperatura = dht.readTemperature();
    float humedad = dht.readHumidity();

    if (isnan(temperatura) || isnan(humedad)) {

      Serial.println("ERROR_SENSOR");

      return;
    }

    // Enviar los datos en un formato
    // fácil de interpretar desde Python
    Serial.print("DATOS:");

    Serial.print(temperatura, 1);

    Serial.print(",");

    Serial.println(humedad, 1);
  }
}
