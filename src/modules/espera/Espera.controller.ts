import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import ListaEspera, { EstadoEspera } from './ListaEspera.model';
import Turno from '../turnos/Turno.model';
import Paciente from '../pacientes/Paciente.model';
import Medico from '../medicos/Medico.model';
import { EstadoTurno } from '../turnos/types/TurnoEstado.enum';
import { calcularHorariosLibres, claveDia, validarTurno } from '../turnos/turnos.service';
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import type { AsignarEsperaDTO, CrearEsperaDTO, QueryEsperaDTO } from './dtos/Espera.schema';

const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const mensajeDeError = (error: unknown) => (error instanceof Error ? error.message : 'Error interno del servidor');

// Máximo de horarios liberados que se muestran de una vez (los más próximos primero)
const MAX_HUECOS = 60;

// ---- Formas que devuelve la base con populate + lean ----
interface Ref { _id: unknown; nombre?: string; apellido?: string; dni?: string; telefono?: { codigoArea?: string; numero?: string } }
interface EsperaPopulada {
    _id: unknown;
    paciente: Ref;
    medico: Ref;
    especialidad: Ref;
    nota?: string;
    estado: EstadoEspera;
    createdAt: Date;
}

const conId = (ref: Ref) => ({
    id: String(ref._id),
    ...(ref.nombre !== undefined ? { nombre: ref.nombre } : {}),
    ...(ref.apellido !== undefined ? { apellido: ref.apellido } : {}),
});

const aEntrada = (e: EsperaPopulada) => ({
    id: String(e._id),
    paciente: {
        ...conId(e.paciente),
        dni: e.paciente.dni,
        telefono: e.paciente.telefono
            ? { codigoArea: e.paciente.telefono.codigoArea, numero: e.paciente.telefono.numero }
            : undefined,
    },
    medico: conId(e.medico),
    especialidad: conId(e.especialidad),
    nota: e.nota,
    estado: e.estado,
    desde: e.createdAt,
});

const esperaPopulada = (filtro: Record<string, unknown>) =>
    ListaEspera.find(filtro)
        .populate('paciente', 'nombre apellido dni telefono')
        .populate('medico', 'nombre apellido')
        .populate('especialidad', 'nombre')
        .sort({ createdAt: 1, _id: 1 }) // el que se anotó primero, primero
        .limit(300)
        .lean<EsperaPopulada[]>();

// POST /espera
export const crearEspera = async (req: Request<unknown, unknown, CrearEsperaDTO>, res: Response) => {
    try {
        const { paciente, medico, nota } = req.body;

        const pacienteDoc = await Paciente.findById(paciente).select('+activo');
        if (!pacienteDoc || pacienteDoc.activo === false) {
            return respuestaEstandar(res, 400, false, 'El paciente no existe o está inactivo');
        }
        const medicoDoc = await Medico.findById(medico).select('+activo especialidad');
        if (!medicoDoc || medicoDoc.activo === false) {
            return respuestaEstandar(res, 400, false, 'El médico no existe o está inactivo');
        }

        const creada = await ListaEspera.create({
            paciente,
            medico,
            especialidad: medicoDoc.especialidad,
            ...(nota ? { nota } : {}),
        });
        return respuestaEstandar(res, 201, true, 'Paciente anotado en la lista de espera', { id: String(creada._id) });
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'Ese paciente ya está en la lista de espera de ese médico');
        }
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// GET /espera?estado=ACTIVA
export const getEspera = async (req: Request<unknown, unknown, unknown, QueryEsperaDTO>, res: Response) => {
    try {
        const estado = req.query.estado ?? EstadoEspera.ACTIVA;
        const entradas = await esperaPopulada({ estado });
        return respuestaEstandar(res, 200, true, 'Lista de espera obtenida', entradas.map(aEntrada));
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// PATCH /espera/:id/cancelar
export const cancelarEspera = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return respuestaEstandar(res, 400, false, 'ID inválido');

        // Atómico: solo cambia si todavía está activa (por si otra persona la cubrió o la canceló justo antes)
        const cambiada = await ListaEspera.findOneAndUpdate(
            { _id: id, estado: EstadoEspera.ACTIVA },
            { estado: EstadoEspera.CANCELADA },
        );
        if (cambiada) return respuestaEstandar(res, 200, true, 'Se sacó al paciente de la lista de espera');

        const existe = await ListaEspera.exists({ _id: id });
        return existe
            ? respuestaEstandar(res, 409, false, 'Esa solicitud ya no estaba activa')
            : respuestaEstandar(res, 404, false, 'Solicitud no encontrada');
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// GET /espera/huecos
// Horarios futuros que quedaron libres por una cancelación, de médicos que tienen gente esperando,
// cada uno con la fila de candidatos (el que se anotó primero, primero).
export const getHuecos = async (_req: Request, res: Response) => {
    try {
        const activas = await esperaPopulada({ estado: EstadoEspera.ACTIVA });
        if (activas.length === 0) return respuestaEstandar(res, 200, true, 'Sin huecos', []);

        const candidatosPorMedico = new Map<string, EsperaPopulada[]>();
        for (const e of activas) {
            const clave = String(e.medico._id);
            candidatosPorMedico.set(clave, [...(candidatosPorMedico.get(clave) ?? []), e]);
        }

        interface TurnoCancelado {
            medico: unknown;
            especialidad: unknown;
            consultorio: { _id: unknown; nombre?: string };
            fechaTurno: Date;
        }
        const cancelados = await Turno.find({
            medico: { $in: [...candidatosPorMedico.keys()] },
            estado: EstadoTurno.CANCELADO,
            fechaTurno: { $gt: new Date() },
        })
            .select('+activo medico especialidad consultorio fechaTurno')
            .populate('consultorio', 'nombre')
            .sort({ fechaTurno: 1 })
            .limit(300)
            .lean<TurnoCancelado[]>();

        // Un horario puede haberse cancelado y vuelto a cancelar: se muestra una sola vez.
        // Además se confirma que siga libre (otro turno pudo haberlo tomado, o el médico pudo ausentarse).
        const librePorDia = new Map<string, Set<string>>();
        const vistos = new Set<string>();
        const huecos = [];

        for (const t of cancelados) {
            if (huecos.length >= MAX_HUECOS) break;
            const medicoId = String(t.medico);
            const inicio = t.fechaTurno.toISOString();
            const unico = `${medicoId}|${inicio}`;
            if (vistos.has(unico)) continue;
            vistos.add(unico);

            const consultorioId = String(t.consultorio._id);
            const claveCache = `${medicoId}|${consultorioId}|${claveDia(t.fechaTurno)}`;
            let libres = librePorDia.get(claveCache);
            if (!libres) {
                const { horarios } = await calcularHorariosLibres(medicoId, consultorioId, claveDia(t.fechaTurno));
                libres = new Set(horarios.map((h) => h.inicio));
                librePorDia.set(claveCache, libres);
            }
            if (!libres.has(inicio)) continue;

            const candidatos = candidatosPorMedico.get(medicoId) ?? [];
            const primero = candidatos[0];
            if (!primero) continue;

            huecos.push({
                clave: unico,
                fechaTurno: inicio,
                medico: conId(primero.medico),
                especialidad: conId(primero.especialidad),
                consultorio: { id: consultorioId, nombre: t.consultorio.nombre },
                candidatos: candidatos.map(aEntrada),
            });
        }

        return respuestaEstandar(res, 200, true, 'Huecos obtenidos', huecos);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// POST /espera/:id/asignar  { consultorio, fechaTurno }
// Le da a esa persona el horario liberado. Se "reserva" la solicitud primero (atómico), así dos recepcionistas
// no le dan turno a la misma persona a la vez; si algo falla, la solicitud vuelve a quedar activa.
export const asignarEspera = async (req: Request<{ id: string }, unknown, AsignarEsperaDTO>, res: Response) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return respuestaEstandar(res, 400, false, 'ID inválido');

    try {
        const espera = await ListaEspera.findOneAndUpdate(
            { _id: id, estado: EstadoEspera.ACTIVA },
            { estado: EstadoEspera.CUBIERTA },
        );
        if (!espera) {
            const existe = await ListaEspera.exists({ _id: id });
            return existe
                ? respuestaEstandar(res, 409, false, 'Esa solicitud ya no estaba activa')
                : respuestaEstandar(res, 404, false, 'Solicitud no encontrada');
        }

        const volverAActiva = () => ListaEspera.updateOne({ _id: id }, { estado: EstadoEspera.ACTIVA });

        try {
            const validacion = await validarTurno({
                paciente: String(espera.paciente),
                consultorio: req.body.consultorio,
                especialidad: String(espera.especialidad),
                medico: String(espera.medico),
                fechaTurno: req.body.fechaTurno,
            });
            if ('error' in validacion) {
                await volverAActiva();
                return respuestaEstandar(res, validacion.estado, false, validacion.error);
            }

            const turno = await Turno.create({
                paciente: espera.paciente,
                consultorio: req.body.consultorio,
                especialidad: espera.especialidad,
                medico: espera.medico,
                fechaTurno: validacion.fechaInicio,
                fechaFin: validacion.fechaFin,
                estado: EstadoTurno.PENDIENTE,
                observaciones: 'Turno dado desde la lista de espera',
            });

            await ListaEspera.updateOne({ _id: id }, { turno: turno._id });
            return respuestaEstandar(res, 201, true, 'Turno asignado desde la lista de espera', turno);
        } catch (error: unknown) {
            await volverAActiva();
            if (esClaveDuplicada(error)) {
                return respuestaEstandar(res, 409, false, 'Ese horario acaba de ser tomado por otro turno.');
            }
            throw error;
        }
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};