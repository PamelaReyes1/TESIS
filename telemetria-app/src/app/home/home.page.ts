import { Component, OnInit, OnDestroy } from '@angular/core';

import { IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonCardSubtitle, IonProgressBar } from '@ionic/angular/standalone';

import { CommonModule } from '@angular/common';

import { Telemetria } from '../services/telemetria';

import {
  Camera,
  CameraResultType,
  CameraSource
} from '@capacitor/camera';

@Component({
  selector: 'app-home',

  templateUrl: 'home.page.html',

  styleUrls: ['home.page.scss'],

  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonCardSubtitle,
  ],
})

export class HomePage implements OnInit, OnDestroy {

  // ==========================================
  // LISTA DE IMÁGENES
  // ==========================================

  imagenes: any[] = [];

  // ==========================================
  // LISTA DE MEDICIONES
  // ==========================================

  mediciones: any[] = [];

  // ==========================================
  // ÚLTIMA MEDICIÓN
  // ==========================================

  ultimaMedicion: any = null;

  // ==========================================
  // FOTO PARA VISTA PREVIA
  // ==========================================

  fotoSeleccionada: string | undefined;

  // ==========================================
  // ARCHIVO PARA SUBIR
  // ==========================================

  archivoSeleccionado: File | undefined;

  // ==========================================
  // RESULTADO DEL ANÁLISIS
  // ==========================================

  resultadoAnalisis: string | undefined;

  confianzaAnalisis: number | undefined;

  modeloAnalisis: string | undefined;

  riesgoAnalisis: string | undefined;

  // Respuesta de la IA: "revision_manual" no es un diagnóstico confirmado.
  estadoDecision: string | undefined;
  clasePropuesta: string | undefined;
  mensajeAnalisis: string | undefined;
  errorAnalisis: string | undefined;
  persistidoAnalisis: boolean | undefined;

  // ==========================================
  // TEMPERATURA Y HUMEDAD DEL ANÁLISIS
  // ==========================================

  temperaturaAnalisis: number | undefined;

  humedadAnalisis: number | undefined;

  // ==========================================
  // ESTADO DE SUBIDA
  // ==========================================

  subiendo: boolean = false;

  // ==========================================
  // TEMPORIZADOR
  // ==========================================

  intervaloActualizacion: any;

  // ==========================================
  // CONSTRUCTOR
  // ==========================================

  constructor(
    public telemetria: Telemetria
  ) { }

  // ==========================================
  // INICIO
  // ==========================================

  ngOnInit() {

    console.log(
      '🚀 Iniciando página de Telemetría IoT'
    );


    this.cargarImagenes();


    this.cargarMediciones();


    this.intervaloActualizacion =
      setInterval(() => {

        console.log(
          '🔄 Actualizando datos de sensores...'
        );

        this.cargarMediciones();

      }, 10000);


  }

  // ==========================================
  // DESTRUIR COMPONENTE
  // ==========================================

  ngOnDestroy() {


    if (
      this.intervaloActualizacion
    ) {

      clearInterval(
        this.intervaloActualizacion
      );

    }


  }

  // ==========================================
  // CARGAR IMÁGENES
  // ==========================================

  cargarImagenes() {


    console.log(
      '🔄 Consultando imágenes...'
    );


    this.telemetria
      .obtenerDatos()
      .subscribe({

        next: (datos) => {

          console.log(
            '📸 Imágenes recibidas:',
            datos
          );


          this.imagenes =
            datos;

        },


        error: (error) => {

          console.error(
            '❌ Error obteniendo imágenes:',
            error
          );

        }

      });


  }

  // ==========================================
  // CARGAR MEDICIONES
  // ==========================================

  cargarMediciones() {


    this.telemetria
      .obtenerMediciones()
      .subscribe({

        next: (datos) => {

          console.log(
            '🌡️ Mediciones recibidas:',
            datos
          );


          this.mediciones =
            datos;


          if (
            datos &&
            datos.length > 0
          ) {

            // El endpoint devuelve las mediciones
            // ordenadas de más reciente a más antigua

            this.ultimaMedicion =
              datos[0];


            console.log(
              '📊 Última medición:',
              this.ultimaMedicion
            );

          } else {

            this.ultimaMedicion =
              null;

          }

        },


        error: (error) => {

          console.error(
            '❌ Error obteniendo mediciones:',
            error
          );

        }

      });


  }

  // ==========================================
  // TOMAR FOTO
  // ==========================================

  async tomarFoto() {


    try {

      console.log(
        '📷 Abriendo cámara o galería...'
      );


      const foto =
        await Camera.getPhoto({

          quality: 90,

          allowEditing: false,

          resultType:
            CameraResultType.DataUrl,

          source:
            CameraSource.Prompt

        });


      if (
        !foto.dataUrl
      ) {

        console.log(
          '⚠️ No se seleccionó ninguna foto'
        );

        return;

      }


      // ==========================================
      // MOSTRAR VISTA PREVIA
      // ==========================================

      this.fotoSeleccionada =
        foto.dataUrl;


      // ==========================================
      // CONVERTIR A FILE
      // ==========================================

      const respuesta =
        await fetch(
          foto.dataUrl
        );


      const blob =
        await respuesta.blob();


      this.archivoSeleccionado =
        new File(

          [blob],

          `foto-uvas-${Date.now()}.jpg`,

          {
            type:
              blob.type ||
              'image/jpeg'
          }

        );


      console.log(
        '📷 Foto seleccionada correctamente'
      );


      console.log(
        '📁 Archivo preparado:',
        this.archivoSeleccionado.name
      );


    } catch (error) {

      console.error(
        '❌ Error al tomar o seleccionar foto:',
        error
      );

    }


  }

  // ==========================================
  // SELECCIONAR ARCHIVO
  // ==========================================

  seleccionarArchivo(
    evento: Event
  ) {


    const input =
      evento.target as HTMLInputElement;


    if (
      !input.files ||
      input.files.length === 0
    ) {

      console.log(
        '⚠️ No se seleccionó ningún archivo'
      );

      return;

    }


    const archivo =
      input.files[0];


    // ==========================================
    // GUARDAR ARCHIVO
    // ==========================================

    this.archivoSeleccionado =
      archivo;


    // ==========================================
    // CREAR VISTA PREVIA
    // ==========================================

    const lector =
      new FileReader();


    lector.onload = () => {

      this.fotoSeleccionada =
        lector.result as string;

    };


    lector.readAsDataURL(
      archivo
    );


    console.log(
      '🖼️ Archivo seleccionado:',
      archivo.name
    );


    console.log(
      '📁 Tamaño:',
      archivo.size,
      'bytes'
    );


    console.log(
      '📄 Tipo:',
      archivo.type
    );


  }

  // ==========================================
  // NORMALIZAR RESPUESTA NODE.JS / FASTAPI
  // ==========================================

  private aplicarResultadoAnalisis(respuesta: any): void {
    const requiereRevision = respuesta?.estado_decision === 'revision_manual';

    this.estadoDecision = respuesta?.estado_decision ?? undefined;
    this.clasePropuesta = respuesta?.clase_propuesta ?? undefined;
    this.persistidoAnalisis = respuesta?.persistido === true;
    this.errorAnalisis = undefined;
    this.mensajeAnalisis = respuesta?.mensaje ?? undefined;

    // En HTTP 202, "resultado" es null: no debemos mostrarlo como "Sano".
    this.resultadoAnalisis = requiereRevision
      ? 'Revisión manual'
      : (respuesta?.resultado ?? respuesta?.estado_uva ?? respuesta?.diagnostico ?? 'Pendiente');

    this.confianzaAnalisis = typeof respuesta?.confianza === 'number'
      ? respuesta.confianza
      : (typeof respuesta?.analisis_ia?.confianza_pct === 'number'
          ? respuesta.analisis_ia.confianza_pct
          : undefined);

    this.modeloAnalisis = respuesta?.modelo ?? respuesta?.analisis_ia?.modelo ?? undefined;
    this.riesgoAnalisis = requiereRevision ? undefined : (respuesta?.riesgo ?? undefined);
    this.temperaturaAnalisis = respuesta?.temperatura ?? undefined;
    this.humedadAnalisis = respuesta?.humedad ?? undefined;
  }

  private informarErrorAnalisis(error: any): void {
    if (error?.status === 0) {
      this.errorAnalisis = 'No se pudo contactar al servidor. Comprueba tu conexión y la configuración CORS del backend.';
    } else {
      this.errorAnalisis = error?.error?.mensaje
        ?? error?.error?.error
        ?? 'No se pudo analizar la fotografía. Intenta nuevamente.';
    }
    this.resultadoAnalisis = undefined;
  }

  // ==========================================
  // SUBIR IMAGEN
  // ==========================================

  subirFoto() {


    console.log(
      '🔘 Botón SUBIR presionado'
    );


    if (
      !this.archivoSeleccionado
    ) {

      console.log(
        '⚠️ No existe archivo seleccionado'
      );

      return;

    }


    this.errorAnalisis = undefined;
    if (this.archivoSeleccionado.size > 8 * 1024 * 1024) {
      this.errorAnalisis = 'La imagen supera el límite permitido de 8 MB.';
      return;
    }

    console.log(
      '📤 Archivo que se enviará:',
      this.archivoSeleccionado.name
    );


    this.subiendo =
      true;


    console.log(
      '⬆️ Enviando imagen al servidor...'
    );


    this.telemetria

      .subirImagen(
        this.archivoSeleccionado
      )

      .subscribe({

        // ==========================================
        // RESPUESTA EXITOSA
        // ==========================================

        next: (respuesta) => {

          console.log(
            '✅ RESPUESTA DEL SERVIDOR:',
            respuesta
          );


          // HTTP 200 y HTTP 202 llegan por "next" en HttpClient.
          // Mostrar revisión manual sin convertirla en diagnóstico definitivo.
          this.aplicarResultadoAnalisis(respuesta);

          console.log(
            '🍇 RESULTADO:',
            this.resultadoAnalisis
          );


          console.log(
            '📊 CONFIANZA:',
            this.confianzaAnalisis
          );


          console.log(
            '🤖 MODELO:',
            this.modeloAnalisis
          );


          console.log(
            '⚠️ RIESGO:',
            this.riesgoAnalisis
          );


          console.log(
            '🌡️ TEMPERATURA:',
            this.temperaturaAnalisis
          );


          console.log(
            '💧 HUMEDAD:',
            this.humedadAnalisis
          );


          this.subiendo =
            false;


          // ==========================================
          // ACTUALIZAR HISTORIAL
          // ==========================================

          this.cargarImagenes();


          // ==========================================
          // ACTUALIZAR MEDICIÓN
          // ==========================================

          this.cargarMediciones();

        },


        // ==========================================
        // ERROR
        // ==========================================

        error: (error) => {

          console.error(
            '❌ ERROR SUBIENDO IMAGEN:',
            error
          );


          console.error(
            '❌ ERROR DETALLADO:',
            error.error
          );


          this.informarErrorAnalisis(error);
          this.subiendo =
            false;

        }

      });

  }
  // ==========================================
  // CAPTURAR FOTO CON ESP32-CAM REMOTA
  // ==========================================
  capturarFotoESP32() {
    console.log('📸 Solicitando captura a la ESP32-CAM...');
    this.subiendo = true;

    this.telemetria.capturarDesdeESP32().subscribe({
      next: (respuesta) => {
        console.log('✅ Foto recibida y analizada:', respuesta);

        // Usar respuesta.ruta (con fallback a respuesta.ruta_imagen por si acaso)
        const rutaRelativa = respuesta.ruta || respuesta.ruta_imagen;

        this.fotoSeleccionada = this.telemetria.urlImagen(rutaRelativa);
        this.aplicarResultadoAnalisis(respuesta);

        this.subiendo = false;
        this.cargarImagenes();
      },
      error: (error) => {
        console.error('❌ Error solicitando captura a ESP32:', error);
        this.informarErrorAnalisis(error);
        this.subiendo = false;
      }
    });

  }
}

