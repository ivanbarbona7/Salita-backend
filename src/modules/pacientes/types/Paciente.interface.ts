import { Document, Types } from 'mongoose';
import { TipoTelefono } from './PacienteTelefono.enum.js';

export interface IDireccion {
    calle: string;
    numero: string;
    piso?: string;
    departamento?: string;
    barrio?: string;
}

export interface ITelefono {
    tipo?: TipoTelefono;
    codigoArea: string;
    numero: string;
}

export interface IObraSocial {
    // Sale del catálogo de obras sociales (Configuración > Obras sociales). Por defecto "NINGUNA".
    nombre: string;
    numeroAfiliado?: string;
}

export interface IPaciente extends Document {
    id?: Types.ObjectId;
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string;
    direccion: IDireccion;
    email: string;
    telefono: ITelefono;
    obraSocial: IObraSocial;
    historialMedico: Types.ObjectId;
    activo: boolean;
    origen?: 'RECEPCION' | 'INGRESO_RAPIDO';
}