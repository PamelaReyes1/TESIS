-- TESIS / MariaDB 10.11 - Migración NO destructiva
-- Ejecutar en phpMyAdmin -> base 'danieltesis_pame' -> SQL.
-- Antes: Exportar/respaldar las tablas imagenes y analisis_imagen.
-- NO importar de nuevo el dump de creación de las 8 tablas.
USE `danieltesis_pame`;

-- La relación con mediciones pasa a ser opcional. Se conserva la clave foránea.
ALTER TABLE `imagenes`
  MODIFY COLUMN `id_medicion` BIGINT(20) NULL;

-- La foto original se guarda en MariaDB y sobrevive los reinicios de Render.
-- Las columnas son opcionales para no romper registros antiguos.
ALTER TABLE `imagenes`
  ADD COLUMN IF NOT EXISTS `contenido` LONGBLOB NULL,
  ADD COLUMN IF NOT EXISTS `tipo_mime` VARCHAR(80) NULL;

-- Registro seguro de resultados no concluyentes.
-- 'resultado' sigue siendo NULL en revisión manual (no inventar diagnóstico).
ALTER TABLE `analisis_imagen`
  ADD COLUMN IF NOT EXISTS `riesgo` ENUM('Bajo','Medio','Alto') NULL,
  ADD COLUMN IF NOT EXISTS `estado_decision` ENUM('aceptada','revision_manual') NOT NULL DEFAULT 'aceptada',
  ADD COLUMN IF NOT EXISTS `clase_propuesta` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `motivos_revision` JSON NULL,
  ADD COLUMN IF NOT EXISTS `probabilidades_json` JSON NULL;

-- Verificar que las columnas existen:
SHOW COLUMNS FROM `imagenes`;
SHOW COLUMNS FROM `analisis_imagen`;
