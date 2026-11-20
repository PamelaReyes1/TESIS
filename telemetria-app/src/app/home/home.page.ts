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

  // Solo captura la ESP32-CAM cuando el usuario pulsa el boton.
  capturandoRemoto: boolean = false;
  estadoCapturaRemota: string | undefined;
  errorCapturaRemota: string | undefined;
  intervaloEstadoCaptura: any;
  idOrdenCaptura: number | undefined;

  // ==========================================
  // TEMPORIZADOR
  // ==========================================

  intervaloActualizacion: any;
  contadorRefrescos: number = 0;

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
        this.contadorRefrescos++;

        // Cada 30 segundos renovar el historial para mostrar
        // las fotos que ESP32-CAM haya enviado por HTTPS.
        if (this.contadorRefrescos % 3 === 0) {
          this.cargarImagenes();
        }

      }, 10000);


  }

  // ==========================================
  // DESTRUIR COMPONENTE
  // ==========================================

  ngOnDestroy() {


    if (this.intervaloEstadoCaptura) {
      clearInterval(this.intervaloEstadoCaptura);
      this.intervaloEstadoCaptura = undefined;
    }

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

            // El backend invierte el resultado SQL y devuelve las
            // mediciones ASCENDENTES. Usar el ID mas alto es fiable
            // incluso si cambia el orden de la respuesta.
            this.ultimaMedicion = datos.reduce(
              (masReciente: any, medicion: any) =>
                Number(medicion.id_medicion) > Number(masReciente.id_medicion)
                  ? medicion : masReciente,
              datos[0]
            );


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

  async tomarFotoLocal() {


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
  // CAPTURA REMOTA: boton del front -> MariaDB -> ESP32-CAM
  // ==========================================
  tomarFoto(): void {
    if (this.capturandoRemoto || this.subiendo) return;

    this.errorCapturaRemota = undefined;
    this.estadoCapturaRemota = 'Enviando orden a la ESP32-CAM...';
    this.capturandoRemoto = true;
    this.idOrdenCaptura = undefined;

    this.telemetria.capturarDesdeESP32().subscribe({
      next: (respuesta: any) => {
        const id = Number(respuesta?.id_orden);
        if (!Number.isSafeInteger(id) || id < 1) {
          this.capturandoRemoto = false;
          this.errorCapturaRemota = 'El servidor no devolvio una orden valida.';
          return;
        }
        this.idOrdenCaptura = id;
        this.estadoCapturaRemota = 'Esperando fotografia de la ESP32-CAM...';
        this.iniciarSeguimientoDeCaptura(id);
      },
      error: (err: any) => {
        this.capturandoRemoto = false;
        this.estadoCapturaRemota = undefined;
        this.errorCapturaRemota = err?.error?.mensaje || 'No se pudo solicitar la captura remota.';
      }
    });
  }

  private iniciarSeguimientoDeCaptura(id: number): void {
    if (this.intervaloEstadoCaptura) clearInterval(this.intervaloEstadoCaptura);
    const inicio = Date.now();
    let consultando = false;
    const consultar = () => {
      if (consultando) return;
      consultando = true;
      this.telemetria.estadoCapturaESP32(id).subscribe({
        next: (r: any) => {
          consultando = false;
          if (r?.estado === 'completada') {
            this.finalizarSeguimiento();
            this.estadoCapturaRemota = `Fotografia #${r.id_imagen} guardada y analizada.`;
            this.cargarImagenCapturada(Number(r.id_imagen));
            this.cargarMediciones();
            return;
          }
          if (r?.estado === 'fallida' || r?.estado === 'expirada') {
            this.finalizarSeguimiento();
            this.estadoCapturaRemota = undefined;
            this.errorCapturaRemota = r?.mensaje_error || 'No se pudo completar la captura.';
            return;
          }
          if (r?.estado === 'procesando' || r?.estado === 'recibida') {
            this.estadoCapturaRemota = 'Camara activada; procesando imagen con IA...';
          }
          if (Date.now() - inicio > 8 * 60 * 1000) {
            this.finalizarSeguimiento();
            this.estadoCapturaRemota = 'La captura sigue en proceso. Consulta el historial para ver si finalizo.';
          }
        },
        error: () => {
          consultando = false;
          // Una consulta puede fallar cuando Render despierta: mantener seguimiento.
          if (Date.now() - inicio > 8 * 60 * 1000) {
            this.finalizarSeguimiento();
            this.errorCapturaRemota = 'No se pudo consultar el estado de la captura.';
          }
        }
      });
    };
    consultar();
    this.intervaloEstadoCaptura = setInterval(consultar, 4000);
  }

  private cargarImagenCapturada(idImagen: number): void {
    this.telemetria.obtenerDatos().subscribe({
      next: (fotos: any[]) => {
        this.imagenes = fotos;
        const nueva = fotos.find(f => Number(f.id_imagen) === idImagen);
        if (nueva) {
          this.aplicarResultadoAnalisis({
            estado_decision: nueva.estado_decision,
            clase_propuesta: nueva.clase_propuesta,
            persistido: true,
            resultado: nueva.resultado,
            estado_uva: nueva.estado_uva,
            confianza: nueva.confianza,
            modelo: nueva.modelo_cnn,
            riesgo: nueva.riesgo,
            temperatura: nueva.temperatura,
            humedad: nueva.humedad,
            mensaje: 'Fotografia de ESP32-CAM guardada correctamente'
          });
        }
      },
      error: () => this.cargarImagenes()
    });
  }

  private finalizarSeguimiento(): void {
    if (this.intervaloEstadoCaptura) {
      clearInterval(this.intervaloEstadoCaptura);
      this.intervaloEstadoCaptura = undefined;
    }
    this.capturandoRemoto = false;
  }

  // Actualiza la lista sin tomar una fotografia nueva.
  actualizarFotosESP32(): void {
    this.cargarImagenes();
    this.cargarMediciones();
  }

}
