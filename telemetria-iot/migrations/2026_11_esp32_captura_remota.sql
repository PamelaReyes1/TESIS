-- Ejecutar UNA SOLA VEZ en phpMyAdmin, base danieltesis_pame.
-- Mantiene la cola en MariaDB aunque Render reinicie o suspenda el servicio.
CREATE TABLE IF NOT EXISTS ordenes_captura_esp32 (
  id_orden BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  estado ENUM('pendiente','procesando','recibida','completada','fallida','expirada')
    NOT NULL DEFAULT 'pendiente',
  active_slot TINYINT NULL DEFAULT NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_inicio DATETIME NULL,
  fecha_fin DATETIME NULL,
  id_imagen BIGINT NULL,
  mensaje_error VARCHAR(250) NULL,
  UNIQUE KEY uq_captura_activa (active_slot),
  KEY idx_estado_orden (estado, id_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
