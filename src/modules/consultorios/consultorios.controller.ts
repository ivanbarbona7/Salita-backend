import type { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import Consultorio from './Consultorio.model.js';
import Medico from '../medicos/Medico.model.js';
import type { IConsultorio } from './types/Consultorio.interface.js';
import type { IActualizarConsultorioDTO, ICrearConsultorioDTO, IQueryConsultorios } from './dtos/consultorio.schema.js';
import { respuestaEstandar } from '../../utils/respuestaEstandar.js';
import { turnosFueraDeHorarioConsultorio, turnosPendientesEnRango } from '../turnos/turnos.service.js';
import { errorDeRango, type IRangoDTO } from '../../utils/rangoFechas.js';

const mensajeDeError = (error: unknown) =>
  error instanceof Error ? error.message : 'Error del servidor';

// 11000 = clave duplicada de MongoDB (nombre o correo ya usados por otro consultorio)
const esClaveDuplicada = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

// La relación médico–consultorio se guarda en el médico. Acá se arma, solo para mostrar,
// la lista de médicos activos que atienden en cada consultorio.
const conMedicos = async (consultorios: HydratedDocument<IConsultorio>[]) => {
  const medicos = await Medico.find({
    consultorios: { $in: consultorios.map((c) => c._id) },
    activo: { $ne: false },
  })
    .select('nombre apellido consultorios')
    .sort({ apellido: 1, nombre: 1 });

  return consultorios.map((consultorio) => ({
    ...consultorio.toJSON(),
    medicos: medicos
      .filter((m) => m.consultorios.some((c) => c.equals(consultorio._id)))
      .map((m) => ({ id: m.id, nombre: m.nombre, apellido: m.apellido })),
  }));
};

const MENSAJE_DUPLICADO = 'Ya existe un consultorio con ese nombre o correo electrónico';

const getConsultorios = async (req: Request<unknown, unknown, unknown, IQueryConsultorios>, res: Response) => {
  try {
    // ?especialidad=<id>&profesionalResponsable=<id>&ciudad=CORRIENTES&activo=true
    const { especialidad, profesionalResponsable, ciudad, activo } = req.query;
    const filtro: Record<string, unknown> = {};

    // el consultorio tiene esa especialidad entre las suyas o atiende todas
    if (especialidad) filtro.$or = [{ especialidades: especialidad }, { todasLasEspecialidades: true }];
    if (profesionalResponsable) filtro.profesionalResponsable = profesionalResponsable;
    if (ciudad) filtro.ciudad = ciudad.toUpperCase();
    // Sin ?activo se devuelven todos (la lista de administración muestra el estado de cada uno).
    // { $ne: false } incluye a los consultorios viejos que no tienen el campo.
    if (activo) filtro.activo = activo === 'true' ? { $ne: false } : false;

    // "activo" tiene select:false en el modelo: sin '+activo' nunca llegaría al front
    const consultorios = await Consultorio.find(filtro)
      .select('+activo')
      .sort({ nombre: 1 })
      .populate('especialidades')
      .populate('profesionalResponsable', 'nombre apellido');

    return respuestaEstandar(res, 200, true, 'Consultorios obtenidos exitosamente', await conMedicos(consultorios));
  } catch (error: unknown) {
    return respuestaEstandar(res, 500, false, 'Error al obtener consultorios', mensajeDeError(error));
  }
};

// NUEVO: agenda de cada consultorio activo: qué médico atiende cada día y a qué hora.
// Los horarios viven en cada médico; acá se juntan por consultorio, solo para mostrar.
const getAgendaConsultorios = async (_req: Request, res: Response) => {
  try {
    const consultorios = await Consultorio.find({ activo: { $ne: false } })
      .select('nombre horarioAtencion')
      .sort({ nombre: 1 });

    const medicos = await Medico.find({
      activo: { $ne: false },
      'horarioAtencion.franjas.0': { $exists: true },
    }).select('nombre apellido horarioAtencion');

    const agenda = consultorios.map((consultorio) => ({
      id: consultorio.id,
      nombre: consultorio.nombre,
      horarioConsultorio: consultorio.horarioAtencion.franjas.map((f) => ({
        diaSemana: f.diaSemana, desde: f.desde, hasta: f.hasta,
      })),
      franjas: medicos.flatMap((medico) =>
        (medico.horarioAtencion?.franjas ?? [])
          .filter((f) => String(f.consultorio) === String(consultorio._id))
          .map((f) => ({
            diaSemana: f.diaSemana,
            desde: f.desde,
            hasta: f.hasta,
            medico: { id: medico.id, nombre: medico.nombre, apellido: medico.apellido },
          }))
      ),
    }));

    return respuestaEstandar(res, 200, true, 'Agenda obtenida exitosamente', agenda);
  } catch (error: unknown) {
    return respuestaEstandar(res, 500, false, 'Error al obtener la agenda', mensajeDeError(error));
  }
};

const getConsultorioById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const consultorio = await Consultorio.findById(req.params.id)
      .select('+activo')
      .populate('especialidades')
      .populate('profesionalResponsable', 'nombre apellido');

    if (!consultorio) {
      return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');
    }

    const [conSusMedicos] = await conMedicos([consultorio]);
    return respuestaEstandar(res, 200, true, 'Consultorio obtenido exitosamente', conSusMedicos);
  } catch (error: unknown) {
    return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
  }
};

const createConsultorio = async (req: Request<unknown, unknown, ICrearConsultorioDTO>, res: Response) => {
  try {
    const nuevoConsultorio = await Consultorio.create(req.body);
    return respuestaEstandar(res, 201, true, 'Consultorio creado exitosamente', nuevoConsultorio);
  } catch (error: unknown) {
    if (error instanceof MongooseError.ValidationError) {
      const errores = Object.values(error.errors).map((err) => err.message);
      return respuestaEstandar(res, 400, false, 'Error de validación', errores);
    }
    if (esClaveDuplicada(error)) {
      return respuestaEstandar(res, 409, false, MENSAJE_DUPLICADO);
    }
    return respuestaEstandar(res, 500, false, 'Error al crear consultorio', mensajeDeError(error));
  }
};

const modificarConsultorio = async (req: Request<{ id: string }, unknown, IActualizarConsultorioDTO>, res: Response) => {
  try {
    const consultorio = await Consultorio.findById(req.params.id).select('+activo');
    if (!consultorio) {
      return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');
    }

    // Lista blanca: solo estos campos se editan, aunque el body traiga otros. undefined = no se toca.
    const { nombre, especialidades, todasLasEspecialidades, profesionalResponsable, direccion, ciudad, telefono, correoElectronico, horarioAtencion, activo } = req.body;
    const cambios = Object.fromEntries(
      Object.entries({ nombre, especialidades: todasLasEspecialidades === true ? [] : especialidades, todasLasEspecialidades, profesionalResponsable, direccion, ciudad, telefono, correoElectronico, horarioAtencion, activo })
        .filter(([, valor]) => valor !== undefined)
    );

    // No se puede quitar ni acortar un horario del consultorio si hay turnos pendientes que quedarían afuera,
    // ni desactivarlo con turnos pendientes: primero hay que reprogramarlos o cancelarlos.
    if (horarioAtencion !== undefined || activo === false) {
      const franjasNuevas = activo === false ? [] : (horarioAtencion?.franjas ?? consultorio.horarioAtencion.franjas);
      const afectados = await turnosFueraDeHorarioConsultorio(String(consultorio._id), franjasNuevas);
      if (afectados.length > 0) {
        const lista = afectados.slice(0, 5).join('; ');
        const resto = afectados.length > 5 ? ` y ${afectados.length - 5} más` : '';
        return respuestaEstandar(
          res, 409, false,
          `No se puede guardar: ${afectados.length} turno(s) pendiente(s) quedarían fuera del nuevo horario: ${lista}${resto}. Reprogramalos o cancelalos antes de cambiar el horario del consultorio.`,
        );
      }
    }

    consultorio.set(cambios);
    await consultorio.save();

    return respuestaEstandar(res, 200, true, 'Consultorio modificado correctamente', consultorio);
  } catch (error: unknown) {
    if (error instanceof MongooseError.ValidationError) {
      const errores = Object.values(error.errors).map((err) => err.message);
      return respuestaEstandar(res, 400, false, 'Error de validación', errores);
    }
    if (esClaveDuplicada(error)) {
      return respuestaEstandar(res, 409, false, MENSAJE_DUPLICADO);
    }
    return respuestaEstandar(res, 500, false, 'Error al modificar el consultorio', mensajeDeError(error));
  }
};

const desactivarConsultorio = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const existente = await Consultorio.findById(req.params.id).select('_id');
    if (!existente) {
      return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');
    }

    const afectados = await turnosFueraDeHorarioConsultorio(String(existente._id), []);
    if (afectados.length > 0) {
      const lista = afectados.slice(0, 5).join('; ');
      const resto = afectados.length > 5 ? ` y ${afectados.length - 5} más` : '';
      return respuestaEstandar(
        res, 409, false,
        `No se puede desactivar: hay ${afectados.length} turno(s) pendiente(s) en este consultorio: ${lista}${resto}. Reprogramalos o cancelalos primero.`,
      );
    }

    const consultorio = await Consultorio.findByIdAndUpdate(req.params.id, { activo: false }, { new: true }).select('+activo');
    if (!consultorio) {
      return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');
    }

    return respuestaEstandar(res, 200, true, 'Consultorio desactivado correctamente', consultorio);
  } catch (error: unknown) {
    return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
  }
};

// CIERRES: fechas en las que el consultorio no atiende (feriados, obras). Hasta 15 días seguidos por carga.
// Valen para todos los médicos del consultorio. Si ya hay turnos pendientes en esas fechas, no se guarda.
const agregarCierreConsultorio = async (req: Request<{ id: string }, unknown, IRangoDTO>, res: Response) => {
  try {
    const consultorio = await Consultorio.findById(req.params.id).select('+activo cierres');
    if (!consultorio || consultorio.activo === false) {
      return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');
    }

    const { desde, hasta, motivo } = req.body;
    const error = errorDeRango({ desde, hasta }, consultorio.cierres ?? []);
    if (error) return respuestaEstandar(res, 400, false, error);

    const afectados = await turnosPendientesEnRango('consultorio', String(consultorio._id), desde, hasta);
    if (afectados.length > 0) {
      return respuestaEstandar(
        res, 409, false,
        `No se puede guardar: ${afectados.length} turno(s) pendiente(s) caen en esas fechas: ${afectados.join(', ')}. Reprogramalos o cancelalos antes de cargar el cierre.`,
      );
    }

    const actualizado = await Consultorio.findByIdAndUpdate(
      consultorio._id,
      { $push: { cierres: { desde, hasta, motivo } } },
      { new: true },
    ).select('cierres');

    return respuestaEstandar(res, 201, true, 'Cierre cargado correctamente', actualizado?.toJSON().cierres ?? []);
  } catch (error: unknown) {
    return respuestaEstandar(res, 500, false, 'Error al cargar el cierre', mensajeDeError(error));
  }
};

const quitarCierreConsultorio = async (req: Request<{ id: string; cierreId: string }>, res: Response) => {
  try {
    const actualizado = await Consultorio.findByIdAndUpdate(
      req.params.id,
      { $pull: { cierres: { _id: req.params.cierreId } } },
      { new: true },
    ).select('cierres');
    if (!actualizado) return respuestaEstandar(res, 404, false, 'Consultorio no encontrado');

    return respuestaEstandar(res, 200, true, 'Cierre quitado correctamente', actualizado.toJSON().cierres ?? []);
  } catch (error: unknown) {
    return respuestaEstandar(res, 400, false, 'No se pudo quitar el cierre', mensajeDeError(error));
  }
};

// Alias: el DELETE desactiva, no borra
const deleteConsultorio = desactivarConsultorio;

export {
  getConsultorios,
  getAgendaConsultorios,
  getConsultorioById,
  createConsultorio,
  modificarConsultorio,
  desactivarConsultorio,
  deleteConsultorio,
  agregarCierreConsultorio,
  quitarCierreConsultorio,
};