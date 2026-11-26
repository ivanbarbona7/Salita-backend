import { Document, Types } from 'mongoose';
import { TipoTelefono } from './ConsultorioTelefono.enum.js';
import type { IRango } from '../../../utils/rangoFechas.js';

export interface ITelefono {
    tipo?: TipoTelefono;
    codigoArea: string;
    numero: string;
}

export interface IDireccion {
    calle: string;
    numero: string;
    piso?: string;
    departamento?: string;
    barrio?: string;
}

// Una franja de atención (ej.: lunes de 08:00 a 12:00). diaSemana: 0 = domingo ... 6 = sábado
export interface IFranjaConsultorio {
    diaSemana: number;
    desde: string;
    hasta: string;
}

export interface IHorarioAtencion {
    franjas: IFranjaConsultorio[];
}

export interface IConsultorio extends Document {
    nombre: string;
    especialidades: Types.ObjectId[];
    // true = atiende cualquier especialidad (la lista de especialidades queda vacía)
    todasLasEspecialidades?: boolean;
    profesionalResponsable: Types.ObjectId;
    direccion: IDireccion;
    telefono: ITelefono;
    correoElectronico: string;
    horarioAtencion: IHorarioAtencion;
    // Fechas en las que el consultorio está cerrado (feriados, obras). No se ofrecen turnos esos días.
    cierres?: IRango[];
    ciudad: string;
    activo?: boolean;
}