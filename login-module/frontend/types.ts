export interface UserRecord {
  id: string;
  dni: string;
  apellidos: string;
  nombres: string;
  fechaRegistro: string;
  ultimoAcceso: string;
  dispositivo: string;
}

export interface UserSession {
  dni: string;
  apellidos: string;
  nombres: string;
  inicio: string;
}
