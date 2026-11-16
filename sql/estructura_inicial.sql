-- SOLO PARA UNA BASE DE DATOS NUEVA. No ejecutes contra tu BD existente sin respaldo y revisión.
-- Crea primero la base de datos y selecciona su nombre en el panel o en el cliente SQL.
CREATE TABLE IF NOT EXISTS mediciones (
  id_medicion INT AUTO_INCREMENT PRIMARY KEY,
  id_sensor INT NOT NULL,
  temperatura DECIMAL(5,2) NOT NULL,
  humedad DECIMAL(5,2) NOT NULL,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS imagenes (
  id_imagen INT AUTO_INCREMENT PRIMARY KEY,
  id_medicion INT NOT NULL,
  ruta_imagen VARCHAR(255) NOT NULL,
  estado_uva VARCHAR(50),
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_imagen_medicion FOREIGN KEY (id_medicion) REFERENCES mediciones(id_medicion)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analisis_imagen (
  id_analisis INT AUTO_INCREMENT PRIMARY KEY,
  id_imagen INT NOT NULL,
  modelo_cnn VARCHAR(100) DEFAULT 'Random Forest',
  resultado VARCHAR(50) NOT NULL,
  confianza DECIMAL(5,2) NOT NULL,
  riesgo VARCHAR(20) NOT NULL,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_analisis_imagen FOREIGN KEY (id_imagen) REFERENCES imagenes(id_imagen)
) ENGINE=InnoDB;
