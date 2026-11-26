import { model, Schema, Document } from 'mongoose';
import { TipoTelefono } from "./types/ConsultorioTelefono.enum.js";
import type { IConsultorio } from "./types/Consultorio.interface.js";
import { rangoFechasMongoose } from "../../utils/rangoFechas.js";

// "HH:mm" en formato de 24 horas
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// diaSemana usa la numeración de Date.getDay(): 0 = domingo ... 6 = sábado
const franjaSchema = new Schema({
    diaSemana: { type: Number, required: true, min: 0, max: 6 },
    desde: { type: String, required: true, match: [HORA, 'La hora de inicio no es válida'] },
    hasta: { type: String, required: true, match: [HORA, 'La hora de fin no es válida'] },
}, { _id: false });

const consultorioSchema = new Schema<IConsultorio>({
  nombre: {
    type: String,
    required: [true, 'El nombre del consultorio es obligatorio'],
    trim: true,
    uppercase: true,
    unique: true,
  },
  // CAMBIO: antes era una sola especialidadId. Ahora un consultorio puede tener varias.
  especialidades: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Especialidad' }],
  },
  todasLasEspecialidades: {
    type: Boolean,
    default: false,
  },
  profesionalResponsable: {
    type: Schema.Types.ObjectId,
    ref: 'Medico',
    required: [true, 'El profesional responsable es obligatorio'],
  },
  telefono: {
        tipo: {
            type: String,
            enum: Object.values(TipoTelefono),
        },
        codigoArea: {
            type: String,
            required: true,
            match: [/^[0-9]{2,5}$/, 'El código de área no es válido'],
        },
        numero: {
            type: String,
            required: true,
            // Con código de área de 4 dígitos el número local tiene 6: {7,10} lo rechazaba
            match: [/^[0-9]{6,8}$/, 'El número de teléfono no es válido'],
        },
  },
  correoElectronico: {
    type: String,
    required: [true, 'El correo electrónico es obligatorio'],
    lowercase: true,
    unique: true,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'El correo electrónico no es válido'],
  },
  direccion: {
          calle: {
              type: String,
              required: [true, 'La calle es obligatoria'],
          },
          numero: {
              type: String,
              required: [true, 'El número es obligatorio'],
          },
          piso: String,
          departamento: String,
          barrio: String,
  },
  // CAMBIO: antes era un String. Ahora es un horario semanal con varias franjas por día.
  // Es obligatorio: se carga una vez al crear el consultorio (después se puede editar).
  // Los horarios de los médicos tienen que quedar dentro de este horario.
  horarioAtencion: {
    franjas: {
      type: [franjaSchema],
      validate: {
        validator: (valor: unknown[]) => valor.length > 0,
        message: 'Cargá al menos un horario de atención',
      },
    },
  },
  // Fechas de cierre (feriados, obras): ese día no se dan turnos en este consultorio
  cierres: { type: [rangoFechasMongoose], default: [] },
  ciudad: {
    type: String,
    required: [true, 'La ciudad es obligatoria'],
    trim: true,
    uppercase: true,
  },
  activo: {
    type: Boolean,
    default: true,
    select: false,
  },
}, {
  timestamps: true,
});

// Al menos una especialidad, salvo que el consultorio atienda todas
consultorioSchema.pre('validate', function () {
  if (this.todasLasEspecialidades !== true && this.especialidades.length === 0) {
    this.invalidate('especialidades', 'Elegí al menos una especialidad o marcá "Atiende todas las especialidades"');
  }
});

consultorioSchema.set('toJSON', {
    transform: (documento: Document, consultorioRetorno: Record<string, any>) => {
        consultorioRetorno.id = consultorioRetorno._id;
        delete consultorioRetorno._id;
        delete consultorioRetorno.__v;
    }
});


const consultorioModel = model<IConsultorio>('Consultorio', consultorioSchema);

export default consultorioModel;