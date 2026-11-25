import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { EstadoTurno } from './types/TurnoEstado.enum';
import Turno from './Turno.model';
import Paciente from '../pacientes/Paciente.model';
import Medico from '../medicos/Medico.model';
import { calcularHorariosLibres, reprogramarTurno, validarTurno, diaLimitePaciente, claveDia, MAX_TURNOS_PENDIENTES, DIAS_MAX_PACIENTE } from './turnos.service';
import { hoyAR } from '../../utils/rangoFechas';
import { turnoPacienteSchema } from './dtos/turno.schema';
import type { CrearTurnoDTO, IQueryDisponibilidad, IQueryListadoTurnos, IQueryUrgencia, IReprogramarTurnoDTO } from './dtos/turno.schema';
import { respuestaEstandar } from '../../utils/respuestaEstandar';

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error interno del servidor';

// 11000 = clave duplicada: otro turno tomó ese horario justo antes (ver el índice único del modelo)
const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const MENSAJE_HORARIO_TOMADO = 'Ese horario acaba de ser tomado por otro turno. Elegí otro.';

// Lo que el front necesita ver de cada turno
const POBLAR = [
    { path: 'paciente' },
    { path: 'medico', select: 'nombre apellido' },
    { path: 'consultorio', select: 'nombre' },
    { path: 'especialidad', select: 'nombre' },
];

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Busca por palabras: "juan perez" => cada palabra tiene que aparecer en alguno de los campos
const filtroPorPalabras = (texto: string, campos: string[]) => {
    const palabras = texto.trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return null;
    return {
        $and: palabras.map((palabra) => {
            const rx = new RegExp(escaparRegex(palabra), 'i');
            return { $or: campos.map((campo) => ({ [campo]: rx })) };
        }),
    };
};

// Un día argentino (UTC-3) como rango de fechas UTC: [00:00 AR, 00:00 AR del día siguiente)
const rangoDelDia = (dia: string) => {
    const inicio = new Date(`${dia}T00:00:00-03:00`);
    return { $gte: inicio, $lt: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
};

const getTurnos = async (req: Request<unknown, unknown, unknown, IQueryListadoTurnos>, res: Response) => {
    try {
        const { id, fecha, q, medico, consultorio, estado, sort, order } = req.query;

        if (id) {
            const turno = await Turno.findById(id).populate(POBLAR);
            if (!turno) return respuestaEstandar(res, 404, false, 'Turno no encontrado');
            return respuestaEstandar(res, 200, true, 'Turnos obtenidos exitosamente', turno);
        }

        const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10) || 20));

        // Filtro base (sin el estado): sirve también para los contadores del día
        const base: Record<string, unknown> = { activo: true };
        if (fecha) base.fechaTurno = rangoDelDia(fecha);
        if (consultorio) base.consultorio = new Types.ObjectId(consultorio);

        // Paciente y médico viven en otras colecciones: se buscan primero sus ids
        const filtroPaciente = filtroPorPalabras(q ?? '', ['nombre', 'apellido', 'dni']);
        if (filtroPaciente) {
            const ids = await Paciente.find(filtroPaciente).select('_id').limit(1000).lean();
            base.paciente = { $in: ids.map((p) => p._id) };
        }
        const filtroMedico = filtroPorPalabras(medico ?? '', ['nombre', 'apellido']);
        if (filtroMedico) {
            const ids = await Medico.find(filtroMedico).select('_id').limit(1000).lean();
            base.medico = { $in: ids.map((m) => m._id) };
        }

        const filtro = estado ? { ...base, estado } : base;
        const dir = order === 'desc' ? -1 : 1;

        // Se ordena y pagina sobre ids (rápido); después se cargan solo los turnos de esa página
        const pipeline: any[] = [{ $match: filtro }];
        if (sort === 'paciente') {
            pipeline.push(
                { $lookup: { from: 'pacientes', localField: 'paciente', foreignField: '_id', as: 'p' } },
                { $sort: { 'p.0.apellido': dir, 'p.0.nombre': dir, fechaTurno: 1, _id: 1 } },
            );
        } else {
            pipeline.push({ $sort: { fechaTurno: dir, _id: 1 } });
        }
        pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1 } });

        const [ordenados, total, nPendientes, nAtendidos, nNoAsistio, nTodos] = await Promise.all([
            Turno.aggregate<{ _id: Types.ObjectId }>(pipeline).collation({ locale: 'es', strength: 2 }),
            Turno.countDocuments(filtro),
            Turno.countDocuments({ ...base, estado: EstadoTurno.PENDIENTE }),
            Turno.countDocuments({ ...base, estado: EstadoTurno.ATENDIDO }),
            Turno.countDocuments({ ...base, estado: EstadoTurno.NO_ASISTIO }),
            Turno.countDocuments(base),
        ]);

        const ids = ordenados.map((t) => t._id);
        const cargados = await Turno.find({ _id: { $in: ids } }).populate(POBLAR);
        const porId = new Map(cargados.map((t) => [String(t._id), t]));
        const items = ids.flatMap((i) => porId.get(String(i)) ?? []);

        return respuestaEstandar(res, 200, true, 'Turnos obtenidos exitosamente', {
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            // Contadores del conjunto filtrado por día/paciente/médico/consultorio (sin el filtro de estado)
            resumen: { total: nTodos, pendientes: nPendientes, atendidos: nAtendidos, noAsistieron: nNoAsistio },
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// NUEVO: horarios libres de un médico en un consultorio, para un día (?medico=&consultorio=&fecha=AAAA-MM-DD)
const getDisponibilidad = async (req: Request<unknown, unknown, unknown, IQueryDisponibilidad>, res: Response) => {
    try {
        const { medico, consultorio, fecha } = req.query;
        const disponibilidad = await calcularHorariosLibres(medico, consultorio, fecha);
        return respuestaEstandar(res, 200, true, 'Horarios obtenidos exitosamente', disponibilidad);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener los horarios', mensajeDeError(error));
    }
};

// SOLO PERSONAL (recepción / admin)
const createTurno = async (req: Request<unknown, unknown, CrearTurnoDTO, IQueryUrgencia>, res: Response) => {
    try {
        const esUrgente = req.query.urgencia === 'true';

        // Las urgencias también eligen un horario, pero pueden usar cualquier consultorio y médico de la especialidad
        const validacion = await validarTurno(req.body, esUrgente);
        if ('error' in validacion) {
            return respuestaEstandar(res, validacion.estado, false, validacion.error);
        }

        if (esUrgente) console.log("🚨 ALERTA: registrado un turno de urgencia");

        const observaciones = esUrgente
            ? `Ingreso por guardia médica${req.body.observaciones ? `. ${req.body.observaciones}` : ''}`
            : req.body.observaciones;

        const nuevoTurno = await Turno.create({
            paciente: req.body.paciente,
            consultorio: req.body.consultorio,
            especialidad: req.body.especialidad,
            medico: req.body.medico,
            fechaTurno: validacion.fechaInicio,
            fechaFin: validacion.fechaFin,
            estado: esUrgente ? EstadoTurno.ATENDIDO : EstadoTurno.PENDIENTE,
            observaciones,
        });
        return respuestaEstandar(res, 201, true, 'Turno creado exitosamente', nuevoTurno);

    } catch (error: unknown) {
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, MENSAJE_HORARIO_TOMADO);
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// SOLO PACIENTE: el paciente sale del token, nunca del body
 const crearTurnoPaciente = async (req: Request, res: Response) => {
    try {
        const datos = turnoPacienteSchema.parse(req.body);
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        // Reglas del pedido del paciente: hasta 30 días hacia adelante y máximo 2 turnos pendientes a la vez
        if (claveDia(new Date(datos.fechaTurno)) > diaLimitePaciente()) {
            return respuestaEstandar(res, 400, false, `Solo podés pedir turnos de los próximos ${DIAS_MAX_PACIENTE} días`);
        }
        const pendientes = await Turno.countDocuments({
            paciente: pacienteId,
            activo: { $ne: false },
            estado: EstadoTurno.PENDIENTE,
            fechaFin: { $gt: new Date() },
        });
        if (pendientes >= MAX_TURNOS_PENDIENTES) {
            return respuestaEstandar(res, 400, false, `Ya tenés ${MAX_TURNOS_PENDIENTES} turnos pendientes. Cancelá uno o esperá a ser atendido para pedir otro.`);
        }

        const validacion = await validarTurno({ ...datos, paciente: pacienteId });
        if ('error' in validacion) {
            return respuestaEstandar(res, validacion.estado, false, validacion.error);
        }

        const turno = await Turno.create({
            paciente: pacienteId,
            consultorio: datos.consultorio,
            especialidad: datos.especialidad,
            medico: datos.medico,
            fechaTurno: validacion.fechaInicio,
            fechaFin: validacion.fechaFin,
            estado: EstadoTurno.PENDIENTE,
            observaciones: datos.observaciones,
        });
        return respuestaEstandar(res, 201, true, 'Turno creado exitosamente', turno);
    } catch (error: unknown) {
        if (error instanceof z.ZodError) return respuestaEstandar(res, 400, false, 'Datos inválidos');
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, MENSAJE_HORARIO_TOMADO);
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// SOLO PERSONAL: cambia la fecha de un turno pendiente (mismo médico y consultorio), sin límite de veces
const reprogramarTurnoPersonal = async (req: Request<{ id: string }, unknown, IReprogramarTurnoDTO>, res: Response) => {
    try {
        const resultado = await reprogramarTurno(req.params.id, req.body.fechaTurno);
        if ('error' in resultado) return respuestaEstandar(res, resultado.estado, false, resultado.error);
        return respuestaEstandar(res, 200, true, 'Turno reprogramado exitosamente');
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, MENSAJE_HORARIO_TOMADO);
        return respuestaEstandar(res, 400, false, 'No se pudo reprogramar el turno', mensajeDeError(error));
    }
};

const deleteTurno = async (req: Request<{ id: string}>, res: Response) => {
    try {

        const { id } = req.params;

        const turnoBorrado = await Turno.findByIdAndUpdate(
            id,
            { activo: false, estado: EstadoTurno.CANCELADO },
            { new: true }
        );

        if (!turnoBorrado) {
            return respuestaEstandar(res, 404, false, `Turno no encontrado con ID ${id}`);
        }

        return respuestaEstandar(res, 200, true, 'Turno eliminado exitosamente', turnoBorrado);
    } catch (error: unknown) {
        console.error('Error al eliminar el turno:', error);
        return respuestaEstandar(res, 400, false, 'ID con formato invalido', mensajeDeError(error));
    }
};



const ETIQUETA_ESTADO: Record<EstadoTurno, string> = {
    [EstadoTurno.PENDIENTE]: 'pendiente',
    [EstadoTurno.ATENDIDO]: 'atendido',
    [EstadoTurno.CANCELADO]: 'cancelado',
    [EstadoTurno.NO_ASISTIO]: 'marcado como "no asistió"',
};

// Cuando un cambio de estado no se pudo aplicar, dice por qué: no existe, o ya no está en el estado que se esperaba
const respuestaSinCambio = async (res: Response, id: string, esperado: EstadoTurno) => {
    const turno = await Turno.findOne({ _id: id, activo: { $ne: false } }).select('estado');
    if (!turno) return respuestaEstandar(res, 404, false, 'Turno no encontrado');
    return respuestaEstandar(
        res,
        409,
        false,
        `El turno está ${ETIQUETA_ESTADO[turno.estado]}; solo se puede cambiar un turno ${ETIQUETA_ESTADO[esperado]}.`,
    );
};

// Cancelar un turno pendiente (recepción y admin): libera el horario. Al eliminar, el admin puede borrar turnos en cualquier estado.
const cancelarTurno = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;
        const turno = await Turno.findOneAndUpdate(
            { _id: id, activo: { $ne: false }, estado: EstadoTurno.PENDIENTE },
            { activo: false, estado: EstadoTurno.CANCELADO },
            { new: true },
        );
        if (!turno) return respuestaSinCambio(res, id, EstadoTurno.PENDIENTE);
        return respuestaEstandar(res, 200, true, 'Turno cancelado', turno);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato invalido', mensajeDeError(error));
    }
};

// Cancelación masiva: solo se cancelan los que siguen pendientes; el resto se informa como "omitidos"
const cancelarTurnos = async (req: Request<unknown, unknown, { ids: string[] }>, res: Response) => {
    try {
        const ids = [...new Set(req.body.ids)];
        const resultado = await Turno.updateMany(
            { _id: { $in: ids }, activo: { $ne: false }, estado: EstadoTurno.PENDIENTE },
            { activo: false, estado: EstadoTurno.CANCELADO },
        );
        const cancelados = resultado.modifiedCount;
        return respuestaEstandar(res, 200, true, 'Turnos cancelados', { cancelados, omitidos: ids.length - cancelados });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Solo un turno pendiente se puede marcar como atendido
const marcarAtendido = async (req: Request<{ id: string}>, res: Response) => {
    try {
        const { id } = req.params;

        const turnoActualizado = await Turno.findOneAndUpdate(
            { _id: id, activo: { $ne: false }, estado: EstadoTurno.PENDIENTE },
            { estado: EstadoTurno.ATENDIDO },
            { new: true }
        );

        if (!turnoActualizado) return respuestaSinCambio(res, id, EstadoTurno.PENDIENTE);
        return respuestaEstandar(res, 200, true, 'turno actualizado', turnoActualizado);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error de servidor', mensajeDeError(error));
    }
};

// El paciente no se presentó: solo un turno pendiente cuya hora ya llegó (lo hacen recepción y admin)
const marcarNoAsistio = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;

        const turno = await Turno.findOneAndUpdate(
            { _id: id, activo: { $ne: false }, estado: EstadoTurno.PENDIENTE, fechaTurno: { $lte: new Date() } },
            { estado: EstadoTurno.NO_ASISTIO },
            { new: true },
        );
        if (turno) return respuestaEstandar(res, 200, true, 'Turno marcado como "no asistió"', turno);

        // Si el turno sigue pendiente, es porque todavía no llegó su hora
        const existente = await Turno.findOne({ _id: id, activo: { $ne: false } }).select('estado');
        if (existente?.estado === EstadoTurno.PENDIENTE) {
            return respuestaEstandar(res, 400, false, 'Todavía no llegó la hora del turno, no se puede marcar que el paciente no asistió.');
        }
        return respuestaSinCambio(res, id, EstadoTurno.PENDIENTE);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato invalido', mensajeDeError(error));
    }
};

// Corrige un "no asistió" marcado por error: vuelve a pendiente, pero solo el mismo día del turno
const deshacerNoAsistio = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;

        const turno = await Turno.findOne({ _id: id, activo: { $ne: false } });
        if (!turno) return respuestaEstandar(res, 404, false, 'Turno no encontrado');
        if (turno.estado !== EstadoTurno.NO_ASISTIO) {
            return respuestaEstandar(res, 409, false, 'El turno no está marcado como "no asistió".');
        }
        if (claveDia(turno.fechaTurno) !== hoyAR()) {
            return respuestaEstandar(res, 409, false, 'Solo se puede deshacer el mismo día del turno.');
        }

        const actualizado = await Turno.findOneAndUpdate(
            { _id: id, estado: EstadoTurno.NO_ASISTIO },
            { estado: EstadoTurno.PENDIENTE },
            { new: true },
        );
        if (!actualizado) return respuestaSinCambio(res, id, EstadoTurno.NO_ASISTIO);
        return respuestaEstandar(res, 200, true, 'Turno vuelto a pendiente', actualizado);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato invalido', mensajeDeError(error));
    }
};

export { cancelarTurno, cancelarTurnos, getTurnos, getDisponibilidad, createTurno, deleteTurno, marcarAtendido, marcarNoAsistio, deshacerNoAsistio, crearTurnoPaciente, reprogramarTurnoPersonal };