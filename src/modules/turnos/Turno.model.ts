import { model, Schema, Document } from "mongoose";
import type { ITurno } from "./types/Turno.interface.js";
import { EstadoTurno } from './types/TurnoEstado.enum.js';

// CAMBIO: modelo limpio. Antes tenía medico y medicoId, y fecha, fechaTurno y fechaFin repetidos,
// y no guardaba el consultorio. verificarDisponibilidadTurno pasó a turnos.service.ts.
const turnoSchema = new Schema<ITurno>({
    paciente: {
        type: Schema.Types.ObjectId,
        ref: 'Paciente',
        required: [true, 'El ID del paciente es obligatorio'],
    },
    consultorio: {
        type: Schema.Types.ObjectId,
        ref: 'Consultorio',
        required: [true, 'El consultorio es obligatorio'],
    },
    especialidad: {
        type: Schema.Types.ObjectId,
        ref: 'Especialidad',
        required: [true, 'La especialidad es obligatoria'],
    },
    medico: {
        type: Schema.Types.ObjectId,
        ref: 'Medico',
        required: [true, 'El médico es obligatorio'],
        index: true,
    },
    fechaTurno: {
        type: Date,
        required: [true, 'La fecha del turno es obligatoria'],
    },
    fechaFin: {
        type: Date,
        required: [true, 'La fecha de fin del turno es obligatoria'],
    },
    estado: {
        type: String,
        enum: {
            values: Object.values(EstadoTurno),
            message: '{VALUE} no es un estado válido',
        },
        default: EstadoTurno.PENDIENTE,
    },
    observaciones: {
        type: String,
        maxlength: [500, 'Las observaciones no pueden superar los 500 caracteres'],
    },
    // Reprogramación: el paciente puede cambiar la fecha una sola vez (el personal, las veces que haga falta)
    reprogramaciones: {
        type: Number,
        default: 0,
    },
    fechaOriginal: {
        type: Date,
    },
    activo: {
        type: Boolean,
        default: true,
        select: false
    }
}, {
        timestamps: true,
});

// Un médico no puede tener dos turnos activos que empiecen a la misma hora.
// Protege de dos altas simultáneas del mismo horario; un turno cancelado (activo: false) libera el horario.
turnoSchema.index({ medico: 1, fechaTurno: 1 }, { unique: true, partialFilterExpression: { activo: true } });

turnoSchema.set('toJSON', {
    transform: (documento: Document, turnoRetorno: Record<string, any>) => {
        turnoRetorno.id = turnoRetorno._id;
        delete turnoRetorno._id;
        delete turnoRetorno.__v;
    }
});


const TurnoModel = model<ITurno>('Turno', turnoSchema);

export default TurnoModel;