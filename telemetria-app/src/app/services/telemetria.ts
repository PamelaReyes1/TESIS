import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class Telemetria {

  // ==========================================
  // URL DEL SERVIDOR
  // ==========================================

  private apiUrl = environment.apiUrl.replace(/\/$/, '');

  public urlImagen(ruta: string): string {
    if (!ruta) return '';
    if (/^https?:\/\//.test(ruta)) return ruta;
    return `${this.apiUrl}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
  }


  // ==========================================
  // CONSTRUCTOR
  // ==========================================

  constructor(
    private http: HttpClient
  ) { }


  // ==========================================
  // OBTENER IMÁGENES DEL SERVIDOR
  // ==========================================

  obtenerDatos(): Observable<any[]> {

    console.log(
      '🌐 Consultando imágenes:',
      `${this.apiUrl}/imagenes/`
    );

    return this.http.get<any[]>(
      `${this.apiUrl}/imagenes/`
    );

  }


  // ==========================================
  // OBTENER MEDICIONES DEL NODEMCU
  // ==========================================

  obtenerMediciones(): Observable<any[]> {

    console.log(
      '🌐 Consultando mediciones:',
      `${this.apiUrl}/mediciones`
    );

    return this.http.get<any[]>(
      `${this.apiUrl}/mediciones`
    );

  }


  // ==========================================
  // SUBIR IMAGEN AL SERVIDOR
  // ==========================================

  subirImagen(
    archivo: File
  ): Observable<any> {

    console.log(
      '📤 Preparando imagen para enviar al servidor'
    );

    console.log(
      '📄 Nombre:',
      archivo.name
    );

    console.log(
      '📦 Tamaño:',
      archivo.size,
      'bytes'
    );

    console.log(
      '🖼️ Tipo:',
      archivo.type
    );


    // ==========================================
    // CREAR FORMDATA
    // ==========================================

    const formData =
      new FormData();


    // ==========================================
    // AGREGAR IMAGEN
    // ==========================================

    formData.append(
      'imagen',
      archivo,
      archivo.name
    );


    console.log(
      '📦 FormData preparado correctamente'
    );


    console.log(
      '🌐 Enviando imagen a:',
      `${this.apiUrl}/imagenes-subir`
    );


    // ==========================================
    // ENVIAR AL SERVIDOR
    // ==========================================

    return this.http.post<any>(
      `${this.apiUrl}/imagenes-subir`,
      formData
    );

  }
  // Encola una orden de captura; no requiere IP LAN de ESP32-CAM.
  capturarDesdeESP32(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/capturar-esp32`, {});
  }

  // Consulta el resultado de la orden para actualizar el historial.
  estadoCapturaESP32(idOrden: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/capturar-esp32/estado/${idOrden}`);
  }
}

