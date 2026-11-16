import os
import sys
import cv2
import numpy as np
import tensorflow as tf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ==========================================================
# CONFIGURACIÓN DINÁMICA DE RUTAS
# ==========================================================
ruta_base = os.path.abspath(os.path.dirname(__file__))

ruta_pesos = os.path.join(
    ruta_base,
    "modelo_final",
    "modelo_uvas_definitivo.keras"
)
if not os.path.exists(ruta_pesos):
    ruta_pesos = os.path.join(
        ruta_base,
        "modelo_final",
        "modelo_uvas_mejor.keras"
    )

# ==========================================================
# GESTIÓN DE RUTA DE IMAGEN (SOPORTA NODE.JS O EJECUCIÓN MANUAL)
# ==========================================================
if len(sys.argv) > 1:
    ruta_imagen = sys.argv[1]
    modo_headless = True  # Viene desde Node.js
else:
    modo_headless = False
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    import tkinter as tk
    from tkinter import filedialog
    
    root = tk.Tk()
    root.withdraw()
    ruta_imagen = filedialog.askopenfilename(
        title="Selecciona una imagen de cultivo para escaneo profundo",
        filetypes=[("Archivos de Imagen", "*.jpg *.jpeg *.png *.webp")]
    )

if not ruta_imagen:
    print("⚠️ Operación cancelada. No se seleccionó ninguna imagen.")
    sys.exit(0)

if not os.path.exists(ruta_imagen):
    print(f"ERROR: La imagen no existe en la ruta '{ruta_imagen}'.")
    sys.exit(1)

# ==========================================================
# RECONSTRUIR ARQUITECTURA LIMPIA Y CARGAR PESOS (EVITA ERROR Keras)
# ==========================================================
IMG_SIZE = 224
numero_de_clases = 3  

base_model = tf.keras.applications.MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights=None 
)

modelo = tf.keras.Sequential([
    base_model,
    tf.keras.layers.GlobalAveragePooling2D(),
    tf.keras.layers.Dense(256, activation='relu'),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(numero_de_clases, activation='softmax')
])

try:
    # Cargamos únicamente los pesos entrenados evitando el conflicto de deserialización de capas
    modelo.load_weights(ruta_pesos)
    clases = ['pudricion_alta', 'pudricion_leve', 'sano']
except Exception as e:
    print(f"❌ ERROR al cargar los pesos del modelo: {e}")
    sys.exit(1)

# ==========================================================
# MOTOR DEL MAPA DE CALOR (GRAD-CAM)
# ==========================================================
def obtener_mapa_calor(modelo, imagen_array, indice_clase):
    try:
        with tf.GradientTape() as tape:
            salida_conv = modelo.layers[0](imagen_array, training=False)
            tape.watch(salida_conv)
            
            x = salida_conv
            for capa in modelo.layers[1:]:
                x = capa(x, training=False)
                
            predicciones = x
            loss = predicciones[:, indice_clase]
            
        grads = tape.gradient(loss, salida_conv)
        pesos_agrupados = tf.reduce_mean(grads, axis=(0, 1, 2))
        
        salida_conv = salida_conv[0]
        mapa_calor = salida_conv @ pesos_agrupados[..., tf.newaxis]
        mapa_calor = tf.squeeze(mapa_calor)
        
        # Normalización (0 a 1) y corrección Gamma
        mapa_calor = tf.maximum(mapa_calor, 0) / (tf.math.reduce_max(mapa_calor) + 1e-10)
        mapa_calor = mapa_calor ** 0.5
        
        return mapa_calor.numpy()
    except Exception:
        return np.ones((7, 7), dtype=np.float32)

# ==========================================================
# EVALUADOR INDIVIDUAL DE CADA CUADRANTE
# ==========================================================
def evaluar_cuadrante(recorte, modelo, clases):
    recorte_rgb = cv2.cvtColor(recorte, cv2.COLOR_BGR2RGB)
    recorte_resized = cv2.resize(recorte_rgb, (IMG_SIZE, IMG_SIZE))
    
    imagen_tensor = np.array(recorte_resized, dtype=np.float32)
    imagen_tensor = tf.keras.applications.mobilenet_v2.preprocess_input(imagen_tensor)
    imagen_batch = np.expand_dims(imagen_tensor, axis=0)
    
    # Predicción
    probabilidades = modelo.predict(imagen_batch, verbose=0)[0]
    indice_clase = int(np.argmax(probabilidades))
    clase_predicha = clases[indice_clase]
    confianza = float(probabilidades[indice_clase] * 100)
    
    mensaje_extra = ""
    # REGLA FAIL-SAFE (Umbral ajustado al 40%)
    if clase_predicha == "sano" and confianza < 40.0:
        clase_predicha = "pudricion_leve"
        indice_clase = clases.index("pudricion_leve")
        mensaje_extra = " (Alerta Forzada)"
        
    # Obtener Mapa de Calor
    mapa_calor = obtener_mapa_calor(modelo, imagen_batch, indice_clase)
    mapa_calor_redimensionado = cv2.resize(mapa_calor, (224, 224))
    mapa_calor_redimensionado = np.uint8(255 * mapa_calor_redimensionado)
    
    mapa_color = cv2.applyColorMap(mapa_calor_redimensionado, cv2.COLORMAP_JET)
    mapa_color = cv2.cvtColor(mapa_color, cv2.COLOR_BGR2RGB)
    
    # Superposición transparente conservando colores reales
    imagen_superpuesta = cv2.addWeighted(recorte_resized, 0.6, mapa_color, 0.4, 0)
    
    return imagen_superpuesta, clase_predicha, confianza, mensaje_extra

# ==========================================================
# ESCÁNER POR CUADRANTES Y MÉTRICA FITOSANITARIA
# ==========================================================
imagen_original = cv2.imread(ruta_imagen)
if imagen_original is None:
    print("❌ ERROR: No se pudo leer la imagen.")
    sys.exit(1)
    
alto, ancho, _ = imagen_original.shape
mitad_alto = alto // 2
mitad_ancho = ancho // 2

cuadrantes = {
    "Superior Izq": imagen_original[0:mitad_alto, 0:mitad_ancho],
    "Superior Der": imagen_original[0:mitad_alto, mitad_ancho:ancho],
    "Inferior Izq": imagen_original[mitad_alto:alto, 0:mitad_ancho],
    "Inferior Der": imagen_original[mitad_alto:alto, mitad_ancho:ancho]
}

resultados_clases = []
resultados_confianzas = []
imagenes_procesadas = []

for nombre, recorte in cuadrantes.items():
    img_superpuesta, clase_predicha, confianza, msj = evaluar_cuadrante(recorte, modelo, clases)
    resultados_clases.append(clase_predicha)
    resultados_confianzas.append(confianza)
    imagenes_procesadas.append((nombre, img_superpuesta, clase_predicha, confianza, msj))

# ==========================================================
# CÁLCULO DEL ÍNDICE DE SEVERIDAD FITOSANITARIA
# ==========================================================
puntuacion_total = 0
for clase in resultados_clases:
    if "pudricion_alta" in clase.lower():
        puntuacion_total += 1.0   # 100% afectado
    elif "pudricion_leve" in clase.lower():
        puntuacion_total += 0.5   # 50% afectado
    else:
        puntuacion_total += 0.0   # 0% afectado (sano)

indice_afectacion = (puntuacion_total / len(resultados_clases)) * 100

if indice_afectacion <= 30.0:
    veredicto_global = "ESTADO: SALUDABLE (Sin patologías aparentes)"
elif 30.0 < indice_afectacion < 50.0:
    veredicto_global = f"ESTADO: AFECTACIÓN LEVE/MODERADA ({indice_afectacion:.1f}% de daño)"
else:
    veredicto_global = f"ESTADO: AFECTACIÓN CRÍTICA/SEVERA ({indice_afectacion:.1f}% de daño)"
    
promedio_confianza = float(np.mean(resultados_confianzas))

# ==========================================================
# SALIDA FORMATEADA EXACTA PARA EL SERVER.JS E IONIC
# ==========================================================
print("==========================================")
print("INFORME TÉCNICO DE EVALUACIÓN FITOSANITARIA")
print("==========================================")
print(f"Diagnóstico: {veredicto_global}")
print(f"Índice de Afectación del Racimo: {indice_afectacion:.1f}%")
print(f"Confianza Analítica Global: {promedio_confianza:.2f}%")
print("==========================================")

# Mostrar ventana gráfica solo si se ejecuta de manera manual en la PC
if not modo_headless:
    try:
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(2, 2, figsize=(10, 10))
        color_global = "green" if indice_afectacion == 0.0 else ("darkorange" if indice_afectacion < 50.0 else "red")
        fig.suptitle(f"{veredicto_global}\nConfianza Analítica: {promedio_confianza:.1f}%", fontsize=13, fontweight='bold', color=color_global)
        axes = axes.flatten()
        
        for i, (nombre, img_sup, clase, conf, msj) in enumerate(imagenes_procesadas):
            axes[i].imshow(img_sup)
            color_titulo = "red" if "pudricion" in clase.lower() else "green"
            axes[i].set_title(f"{nombre}: {clase} ({conf:.1f}%){msj}", color=color_titulo, fontweight='bold')
            axes[i].axis('off')
            
        plt.tight_layout()
        plt.subplots_adjust(top=0.82)
        plt.show()
    except Exception:
        pass