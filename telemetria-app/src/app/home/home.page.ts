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


          // ==========================================
          // GUARDAR RESULTADO ML
          // ==========================================

          this.resultadoAnalisis =
            respuesta.resultado;


          this.confianzaAnalisis =
            respuesta.confianza;


          this.modeloAnalisis =
            respuesta.modelo;


          // ==========================================
          // GUARDAR RIESGO
          // ==========================================

          this.riesgoAnalisis =
            respuesta.riesgo;


          // ==========================================
          // GUARDAR TEMPERATURA
          // ==========================================

          this.temperaturaAnalisis =
            respuesta.temperatura;


          // ==========================================
          // GUARDAR HUMEDAD
          // ==========================================

          this.humedadAnalisis =
            respuesta.humedad;


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
        this.resultadoAnalisis = respuesta.resultado;
        this.confianzaAnalisis = respuesta.confianza;
        this.modeloAnalisis = respuesta.modelo;
        this.riesgoAnalisis = respuesta.riesgo;
        this.temperaturaAnalisis = respuesta.temperatura;
        this.humedadAnalisis = respuesta.humedad;

        this.subiendo = false;
        this.cargarImagenes();
      },
      error: (error) => {
        console.error('❌ Error solicitando captura a ESP32:', error);
        this.subiendo = false;
      }
    });

  }
}

