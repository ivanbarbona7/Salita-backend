import Turno from './Turno.model.js';
import Medico from '../medicos/Medico.model.js';
import type { IMedico } from '../medicos/types/Medico.interface.js';
import Consultorio from '../consultorios/Consultorio.model.js';
import { atiendeEspecialidad } from '../consultorios/atiendeEspecialidad.js';
import Paciente from '../pacientes/Paciente.model.js';
import { EstadoTurno } from './types/TurnoEstado.enum.js';

// Argentina no tiene horario de verano: siempre es UTC-3.
// Los horarios del médico ("08:00") están en hora argentina, y los turnos se guardan en UTC.
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * 60 * MINUTO_MS;

// Los turnos pendientes, atendidos y los de pacientes que no asistieron ocupan el horario; los cancelados lo liberan
const ESTADOS_QUE_OCUPAN = [EstadoTurno.PENDIENTE, EstadoTurno.ATENDIDO, EstadoTurno.NO_ASISTIO];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

// "2026-11-16" en hora argentina
export const claveDia = (fecha: Date): string => {
    const local = new Date(fecha.getTime() + OFFSET_ARGENTINA_MS); // se leen los campos UTC de esta fecha corrida
    return `${local.getUTCFullYear()}-${dosDigitos(local.getUTCMonth() + 1)}-${dosDigitos(local.getUTCDate())}`;
};

const aMinutos = (hhmm: string) => {
    const [horas = 0, minutos = 0] = hhmm.split(':').map(Number);
    return horas * 60 + minutos;
};

export interface HorarioLibre {
    inicio: string; // ISO en UTC: es lo que el front manda de vuelta al crear el turno
    hora: string;   // "08:20", en hora argentina
}

export interface HorarioConConsultorio extends HorarioLibre {
    consultorio: string; // id del consultorio de la franja
}

interface FranjaHorario { diaSemana: number; desde: string; hasta: string; consultorio: unknown }
interface RangoDia { desde: string; hasta: string }

// ¿El día ("AAAA-MM-DD") cae dentro de alguno de los rangos de fechas?
const enRango = (dia: string, rangos: RangoDia[]) => rangos.some((r) => dia >= r.desde && dia <= r.hasta);
const rangosDe = (rangos?: RangoDia[] | null): RangoDia[] => (rangos ?? []).map((r) => ({ desde: r.desde, hasta: r.hasta }));
const ausenciasDe = (medico: { ausencias?: RangoDia[] | undefined }) => rangosDe(medico.ausencias);
interface TurnoOcupado { fechaTurno: Date; fechaFin: Date }

// Reglas del pedido de turno del paciente
export const DIAS_MAX_PACIENTE = 30;       // hasta cuántos días hacia adelante puede pedir
export const MAX_TURNOS_PENDIENTES = 2;    // turnos pendientes a la vez por paciente
export const MAX_REPROGRAMACIONES_PACIENTE = 1; // veces que un paciente puede cambiar la fecha de un turno
export const HORAS_PARA_CAMBIAR = 24;     // anticipación mínima para cancelar o reprogramar

// Último día ("AAAA-MM-DD", hora argentina) en que un paciente puede pedir turno
export const diaLimitePaciente = () => claveDia(new Date(Date.now() + DIAS_MAX_PACIENTE * DIA_MS));

// Núcleo del cálculo, sin base de datos: las franjas de ese día de la semana, partidas en turnos de `duracion`
// minutos, menos los que ya pasaron y los que chocan con un turno ocupado.
const generarHorarios = (
    franjas: FranjaHorario[],
    duracion: number,
    dia: string,
    ocupados: TurnoOcupado[],
    consultorioId?: string,
    // Fechas en las que el médico no atiende, y cierres de cada consultorio (por id): ese día no hay horarios
    ausencias: RangoDia[] = [],
    cierres: Map<string, RangoDia[]> = new Map(),
): HorarioConConsultorio[] => {
    if (enRango(dia, ausencias)) return [];

    const inicioDia = new Date(`${dia}T00:00:00-03:00`);
    const diaSemana = new Date(`${dia}T12:00:00-03:00`).getUTCDay(); // 0 = domingo ... 6 = sábado
    const ahora = new Date();
    const horarios: HorarioConConsultorio[] = [];

    const delDia = franjas.filter(
        (f) =>
            f.diaSemana === diaSemana &&
            (!consultorioId || String(f.consultorio) === consultorioId) &&
            !enRango(dia, cierres.get(String(f.consultorio)) ?? [])
    );

    for (const franja of [...delDia].sort((a, b) => a.desde.localeCompare(b.desde))) {
        for (let minuto = aMinutos(franja.desde); minuto + duracion <= aMinutos(franja.hasta); minuto += duracion) {
            const inicio = new Date(inicioDia.getTime() + minuto * MINUTO_MS);
            const fin = new Date(inicio.getTime() + duracion * MINUTO_MS);

            if (inicio <= ahora) continue; // ya pasó

            const chocaConOtroTurno = ocupados.some((t) => t.fechaTurno < fin && t.fechaFin > inicio);
            if (chocaConOtroTurno) continue;

            horarios.push({
                inicio: inicio.toISOString(),
                hora: `${dosDigitos(Math.floor(minuto / 60))}:${dosDigitos(minuto % 60)}`,
                consultorio: String(franja.consultorio),
            });
        }
    }

    return horarios;
};

// Horarios libres de un médico en un consultorio y un día ("AAAA-MM-DD"):
// los del horario que cargó el admin, menos los turnos ya tomados y los que ya pasaron.
export const calcularHorariosLibres = async (medicoId: string, consultorioId: string, dia: string) => {
    const medico = await Medico.findById(medicoId).select('+activo horarioAtencion ausencias');
    if (!medico || medico.activo === false) {
        return { duracionTurno: 0, horarios: [] as HorarioLibre[] };
    }

    const duracion = medico.horarioAtencion?.duracionTurno ?? 20;
    const inicioDia = new Date(`${dia}T00:00:00-03:00`);

    // Se mira al médico en general (no solo en este consultorio): no puede estar en dos turnos a la vez
    const ocupados = await Turno.find({
        medico: medico._id,
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $gte: inicioDia, $lt: new Date(inicioDia.getTime() + DIA_MS) },
    }).select('fechaTurno fechaFin');

    const consultorio = await Consultorio.findById(consultorioId).select('cierres');
    const cierres = new Map([[consultorioId, rangosDe(consultorio?.cierres)]]);

    const horarios = generarHorarios(medico.horarioAtencion?.franjas ?? [], duracion, dia, ocupados, consultorioId, ausenciasDe(medico), cierres)
        .map(({ inicio, hora }) => ({ inicio, hora }));

    return { duracionTurno: duracion, horarios };
};

// Consultorios que siguen activos (una franja en un consultorio dado de baja no se ofrece al paciente),
// cada uno con sus fechas de cierre. Se usa como "Set" (has) y para saber cuándo está cerrado.
const consultoriosActivos = async (ids: string[]) => {
    const activos = await Consultorio.find({ _id: { $in: ids }, activo: { $ne: false } }).select('_id cierres');
    return new Map(activos.map((c) => [String(c._id), rangosDe(c.cierres)] as [string, RangoDia[]]));
};

const franjasDe = (medico: IMedico) => medico.horarioAtencion?.franjas ?? [];

export interface DiaDisponible {
    fecha: string;   // "AAAA-MM-DD"
    libres: number;  // cantidad de horarios libres ese día
    primero: string; // ISO del primer horario libre del día
}

// PEDIDO DE TURNO DEL PACIENTE: para cada médico, los días (hasta DIAS_MAX_PACIENTE hacia adelante) que tienen
// horarios libres. Hace una sola consulta de turnos y una de consultorios para todos los médicos.
export const disponibilidadPorMedico = async (medicos: IMedico[]): Promise<Map<string, DiaDisponible[]>> => {
    const resultado = new Map<string, DiaDisponible[]>();
    if (medicos.length === 0) return resultado;

    const activos = await consultoriosActivos([
        ...new Set(medicos.flatMap((m) => franjasDe(m).map((f) => String(f.consultorio)))),
    ]);

    const desde = new Date();
    const hasta = new Date(Date.now() + (DIAS_MAX_PACIENTE + 1) * DIA_MS);
    const ocupados = await Turno.find({
        medico: { $in: medicos.map((m) => m._id) },
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $gte: desde, $lt: hasta },
    }).select('medico fechaTurno fechaFin');

    for (const medico of medicos) {
        const franjas = franjasDe(medico).filter((f) => activos.has(String(f.consultorio)));
        const duracion = medico.horarioAtencion?.duracionTurno ?? 20;
        const propios = ocupados.filter((t) => String(t.medico) === String(medico._id));
        const dias: DiaDisponible[] = [];

        for (let i = 0; i <= DIAS_MAX_PACIENTE; i++) {
            const dia = claveDia(new Date(Date.now() + i * DIA_MS));
            const horarios = generarHorarios(franjas, duracion, dia, propios, undefined, ausenciasDe(medico), activos);
            const primero = horarios[0];
            if (primero) dias.push({ fecha: dia, libres: horarios.length, primero: primero.inicio });
        }
        resultado.set(String(medico._id), dias);
    }

    return resultado;
};

// Horarios libres de un médico en un día, en cualquiera de sus consultorios activos
export const horariosDeUnDia = async (medico: IMedico, dia: string): Promise<HorarioConConsultorio[]> => {
    const activos = await consultoriosActivos([...new Set(franjasDe(medico).map((f) => String(f.consultorio)))]);
    const inicioDia = new Date(`${dia}T00:00:00-03:00`);
    const ocupados = await Turno.find({
        medico: medico._id,
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $gte: inicioDia, $lt: new Date(inicioDia.getTime() + DIA_MS) },
    }).select('fechaTurno fechaFin');

    return generarHorarios(
        franjasDe(medico).filter((f) => activos.has(String(f.consultorio))),
        medico.horarioAtencion?.duracionTurno ?? 20,
        dia,
        ocupados,
        undefined,
        ausenciasDe(medico),
        activos,
    );
};

type FranjaParaControl = { diaSemana: number; desde: string; hasta: string; consultorio?: string };

// De una búsqueda de turnos pendientes, devuelve los que no entran completos en alguna franja
// (mismo día de la semana y, si la franja trae consultorio, mismo consultorio), como texto para mostrar.
const describirFueraDeHorario = async (
    filtro: Record<string, unknown>,
    franjas: FranjaParaControl[],
): Promise<string[]> => {
    const pendientes = await Turno.find({
        ...filtro,
        activo: { $ne: false },
        estado: EstadoTurno.PENDIENTE,
        fechaFin: { $gt: new Date() },
    }).sort({ fechaTurno: 1 });

    const afectados = pendientes.filter((t) => {
        const inicio = new Date(t.fechaTurno.getTime() + OFFSET_ARGENTINA_MS); // se leen los campos UTC (hora argentina)
        const fin = new Date(t.fechaFin.getTime() + OFFSET_ARGENTINA_MS);
        const minInicio = inicio.getUTCHours() * 60 + inicio.getUTCMinutes();
        const minFin = fin.getUTCHours() * 60 + fin.getUTCMinutes() || 24 * 60;
        return !franjas.some(
            (f) =>
                (f.consultorio === undefined || f.consultorio === String(t.consultorio)) &&
                f.diaSemana === inicio.getUTCDay() &&
                aMinutos(f.desde) <= minInicio &&
                minFin <= aMinutos(f.hasta),
        );
    });
    if (afectados.length === 0) return [];

    const pacientes = await Paciente.find({ _id: { $in: afectados.map((t) => t.paciente) } }).select('nombre apellido');
    const nombres = new Map(pacientes.map((p) => [String(p._id), `${p.apellido ?? ''} ${p.nombre}`.trim()]));

    return afectados.map((t) => {
        const local = new Date(t.fechaTurno.getTime() + OFFSET_ARGENTINA_MS);
        const dia = `${dosDigitos(local.getUTCDate())}/${dosDigitos(local.getUTCMonth() + 1)}`;
        const hora = `${dosDigitos(local.getUTCHours())}:${dosDigitos(local.getUTCMinutes())}`;
        return `${dia} ${hora} (${nombres.get(String(t.paciente)) ?? 'paciente'})`;
    });
};

// Turnos pendientes de un médico que quedarían fuera de su horario nuevo (para bloquear el cambio).
export const turnosFueraDeHorario = (
    medicoId: string,
    franjas: { diaSemana: number; desde: string; hasta: string; consultorio: string }[],
): Promise<string[]> => describirFueraDeHorario({ medico: medicoId }, franjas);

// Turnos pendientes de cualquier médico en un consultorio que quedarían fuera del horario nuevo del consultorio.
// Pasar franjas vacías equivale a cerrarlo del todo (por ejemplo, al desactivarlo).
export const turnosFueraDeHorarioConsultorio = (
    consultorioId: string,
    franjas: { diaSemana: number; desde: string; hasta: string }[],
): Promise<string[]> => describirFueraDeHorario({ consultorio: consultorioId }, franjas);

export interface DatosTurno {
    paciente: string;
    consultorio: string;
    especialidad: string;
    medico: string;
    fechaTurno: string; // ISO
}

export type ResultadoValidacion =
    | { error: string; estado: number }
    | { fechaInicio: Date; fechaFin: Date };

// Una urgencia se puede registrar hasta 12 horas después de que ocurrió
const MAX_ATRASO_URGENCIA_MS = 12 * 60 * MINUTO_MS;

// Valida toda la cadena, aunque el front ya la haya filtrada.
//
// Turno normal: paciente, consultorio activo, especialidad del consultorio, médico de esa especialidad
// que atiende ahí, y que el horario sea uno de los libres.
//
// Urgencia: se puede usar cualquier consultorio con esa especialidad y cualquier médico de ella; el horario
// no tiene que estar en su agenda, pero no puede superponerse con otro turno del médico.
export const validarTurno = async (datos: DatosTurno, urgente = false): Promise<ResultadoValidacion> => {
    const paciente = await Paciente.findById(datos.paciente).select('+activo');
    if (!paciente || paciente.activo === false) {
        return { error: 'El paciente no existe o está inactivo', estado: 400 };
    }

    const consultorio = await Consultorio.findById(datos.consultorio).select('+activo especialidades todasLasEspecialidades cierres');
    if (!consultorio || consultorio.activo === false) {
        return { error: 'El consultorio no existe o está inactivo', estado: 400 };
    }
    if (!atiendeEspecialidad(consultorio, datos.especialidad)) {
        return { error: 'El consultorio no tiene esa especialidad', estado: 400 };
    }

    const medico = await Medico.findById(datos.medico).select('+activo especialidad consultorios horarioAtencion');
    if (!medico || medico.activo === false) {
        return { error: 'El médico no existe o está inactivo', estado: 400 };
    }
    if (String(medico.especialidad) !== datos.especialidad) {
        return { error: 'El médico no atiende esa especialidad', estado: 400 };
    }
    // En una urgencia el médico no tiene por qué atender en ese consultorio
    if (!urgente && !medico.consultorios.some((c) => String(c) === datos.consultorio)) {
        return { error: 'El médico no atiende en ese consultorio', estado: 400 };
    }

    const inicio = new Date(datos.fechaTurno);
    if (Number.isNaN(inicio.getTime())) {
        return { error: 'La fecha y hora no son válidas', estado: 400 };
    }

    const duracion = medico.horarioAtencion?.duracionTurno ?? 20;
    const fin = new Date(inicio.getTime() + duracion * MINUTO_MS);

    if (urgente) {
        if (inicio.getTime() < Date.now() - MAX_ATRASO_URGENCIA_MS) {
            return { error: 'La fecha de una urgencia no puede ser de hace más de 12 horas', estado: 400 };
        }

        // Aunque sea urgencia, no se puede atender en un consultorio cerrado ese día (obras, refacciones)
        if (enRango(claveDia(inicio), rangosDe(consultorio.cierres))) {
            return { error: 'El consultorio está cerrado ese día', estado: 409 };
        }

        const medicoOcupado = await Turno.exists({
            medico: medico._id,
            activo: { $ne: false },
            estado: { $in: ESTADOS_QUE_OCUPAN },
            fechaTurno: { $lt: fin },
            fechaFin: { $gt: inicio },
        });
        if (medicoOcupado) {
            return { error: 'El médico ya tiene un turno en ese horario', estado: 409 };
        }
    } else {
        // Tiene que ser exactamente uno de los horarios libres: dentro del horario del médico en ese consultorio,
        // alineado con la duración del turno, en el futuro y sin otro turno encima.
        const { horarios } = await calcularHorariosLibres(datos.medico, datos.consultorio, claveDia(inicio));
        if (!horarios.some((h) => h.inicio === inicio.toISOString())) {
            return {
                error: 'Ese horario no está disponible: el médico no atiende en ese día y hora, o ya fue tomado',
                estado: 409,
            };
        }
    }

    // El paciente no puede tener otro turno al mismo tiempo (con ningún médico)
    const pacienteOcupado = await Turno.exists({
        paciente: paciente._id,
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $lt: fin },
        fechaFin: { $gt: inicio },
    });
    if (pacienteOcupado) {
        return { error: 'El paciente ya tiene un turno en ese horario', estado: 409 };
    }

    return { fechaInicio: inicio, fechaFin: fin };
};

// ---------------------------------------------------------------------------------------------
// REPROGRAMAR: el turno conserva el médico y el consultorio; solo cambia la fecha y hora.
// ---------------------------------------------------------------------------------------------

// Motivo por el que un paciente NO puede reprogramar un turno (null = sí puede). Lo usa la lista "Mis turnos"
// para mostrar el botón deshabilitado y lo vuelve a usar el endpoint, para no confiar en el front.
export const motivoNoReprogramarPaciente = (turno: {
    estado: string;
    fechaTurno: Date;
    reprogramaciones?: number | undefined;
}): string | null => {
    if (turno.estado !== EstadoTurno.PENDIENTE) return 'Solo se pueden reprogramar turnos pendientes.';
    if ((turno.reprogramaciones ?? 0) >= MAX_REPROGRAMACIONES_PACIENTE) {
        return 'Ya usaste tu reprogramación de este turno. Si necesitás otro cambio, cancelalo o comunicate con la salita.';
    }
    if (turno.fechaTurno.getTime() - Date.now() < HORAS_PARA_CAMBIAR * 60 * MINUTO_MS) {
        return `Solo se puede reprogramar hasta ${HORAS_PARA_CAMBIAR} horas antes. Comunicate con la salita.`;
    }
    return null;
};

// Días (hasta DIAS_MAX_PACIENTE hacia adelante) con horarios libres de un médico en un consultorio.
// Una sola consulta de turnos para todo el rango.
export const diasLibresEnConsultorio = async (medicoId: string, consultorioId: string): Promise<DiaDisponible[]> => {
    const medico = await Medico.findById(medicoId).select('+activo horarioAtencion ausencias');
    if (!medico || medico.activo === false) return [];
    const consultorio = await Consultorio.findById(consultorioId).select('cierres');
    const cierres = new Map([[consultorioId, rangosDe(consultorio?.cierres)]]);

    const ocupados = await Turno.find({
        medico: medico._id,
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $gte: new Date(), $lt: new Date(Date.now() + (DIAS_MAX_PACIENTE + 1) * DIA_MS) },
    }).select('fechaTurno fechaFin');

    const franjas = medico.horarioAtencion?.franjas ?? [];
    const duracion = medico.horarioAtencion?.duracionTurno ?? 20;
    const dias: DiaDisponible[] = [];

    for (let i = 0; i <= DIAS_MAX_PACIENTE; i++) {
        const dia = claveDia(new Date(Date.now() + i * DIA_MS));
        const horarios = generarHorarios(franjas, duracion, dia, ocupados, consultorioId, ausenciasDe(medico), cierres);
        const primero = horarios[0];
        if (primero) dias.push({ fecha: dia, libres: horarios.length, primero: primero.inicio });
    }
    return dias;
};

export type ResultadoReprogramar = { error: string; estado: number } | { turnoId: string };

// Cambia la fecha de un turno pendiente. `pacienteId` solo viene cuando lo pide el propio paciente:
// ahí se exige que el turno sea suyo y se aplican las reglas (una vez, 24 h antes, hasta 30 días).
// El personal (sin pacienteId) puede reprogramar cualquier turno pendiente, las veces que haga falta.
export const reprogramarTurno = async (
    turnoId: string,
    nuevaFecha: string,
    pacienteId?: string,
): Promise<ResultadoReprogramar> => {
    const turno = await Turno.findOne({
        _id: turnoId,
        activo: { $ne: false },
        ...(pacienteId && { paciente: pacienteId }),
    });
    if (!turno) return { error: 'Turno no encontrado', estado: 404 };
    if (turno.estado !== EstadoTurno.PENDIENTE) {
        return { error: 'Solo se pueden reprogramar turnos pendientes', estado: 400 };
    }

    if (pacienteId) {
        const motivo = motivoNoReprogramarPaciente(turno);
        if (motivo) return { error: motivo, estado: 400 };
    }

    const inicio = new Date(nuevaFecha);
    if (Number.isNaN(inicio.getTime())) return { error: 'La fecha y hora no son válidas', estado: 400 };
    if (inicio.getTime() === turno.fechaTurno.getTime()) {
        return { error: 'Elegí un horario distinto al actual', estado: 400 };
    }
    if (pacienteId && claveDia(inicio) > diaLimitePaciente()) {
        return { error: `Solo podés elegir fechas de los próximos ${DIAS_MAX_PACIENTE} días`, estado: 400 };
    }

    // Tiene que ser uno de los horarios libres del mismo médico en el mismo consultorio
    const { horarios, duracionTurno } = await calcularHorariosLibres(
        String(turno.medico), String(turno.consultorio), claveDia(inicio),
    );
    if (!horarios.some((h) => h.inicio === inicio.toISOString())) {
        return { error: 'Ese horario no está disponible: el médico no atiende en ese día y hora, o ya fue tomado', estado: 409 };
    }
    const fin = new Date(inicio.getTime() + duracionTurno * MINUTO_MS);

    // El paciente no puede tener otro turno a la misma hora (se excluye este mismo turno)
    const pacienteOcupado = await Turno.exists({
        _id: { $ne: turno._id },
        paciente: turno.paciente,
        activo: { $ne: false },
        estado: { $in: ESTADOS_QUE_OCUPAN },
        fechaTurno: { $lt: fin },
        fechaFin: { $gt: inicio },
    });
    if (pacienteOcupado) return { error: 'El paciente ya tiene un turno en ese horario', estado: 409 };

    // Se actualiza con la condición original: si dos pedidos llegan a la vez, solo uno aplica el cambio.
    // El índice único (médico + fecha) frena una colisión con otro turno (error 11000, lo resuelve el controller).
    const actualizado = await Turno.findOneAndUpdate(
        {
            _id: turno._id,
            estado: EstadoTurno.PENDIENTE,
            activo: { $ne: false },
            fechaTurno: turno.fechaTurno,
            ...(pacienteId && { reprogramaciones: { $not: { $gte: MAX_REPROGRAMACIONES_PACIENTE } } }),
        },
        {
            fechaTurno: inicio,
            fechaFin: fin,
            $inc: { reprogramaciones: 1 },
            ...(turno.fechaOriginal ? {} : { fechaOriginal: turno.fechaTurno }),
        },
        { new: true },
    );
    if (!actualizado) return { error: 'El turno cambió mientras lo reprogramabas. Volvé a intentarlo', estado: 409 };

    return { turnoId: String(actualizado._id) };
};

// Turnos pendientes de un médico o de un consultorio que caen entre dos fechas ("AAAA-MM-DD", inclusive).
// Se usa para frenar una ausencia o un cierre que dejaría turnos sin atender: primero hay que reprogramarlos.
export const turnosPendientesEnRango = async (
    campo: 'medico' | 'consultorio',
    id: string,
    desde: string,
    hasta: string,
): Promise<string[]> => {
    const inicio = new Date(`${desde}T00:00:00-03:00`);
    const fin = new Date(new Date(`${hasta}T00:00:00-03:00`).getTime() + DIA_MS);

    const pendientes = await Turno.find({
        [campo]: id,
        activo: { $ne: false },
        estado: EstadoTurno.PENDIENTE,
        fechaTurno: { $gte: inicio, $lt: fin },
    })
        .sort({ fechaTurno: 1 })
        .limit(50);
    if (pendientes.length === 0) return [];

    const pacientes = await Paciente.find({ _id: { $in: pendientes.map((t) => t.paciente) } }).select('nombre apellido');
    const nombres = new Map(pacientes.map((p) => [String(p._id), `${p.apellido ?? ''} ${p.nombre}`.trim()]));

    return pendientes.map((t) => {
        const local = new Date(t.fechaTurno.getTime() + OFFSET_ARGENTINA_MS);
        const dia = `${dosDigitos(local.getUTCDate())}/${dosDigitos(local.getUTCMonth() + 1)}`;
        const hora = `${dosDigitos(local.getUTCHours())}:${dosDigitos(local.getUTCMinutes())}`;
        return `${dia} ${hora} (${nombres.get(String(t.paciente)) ?? 'paciente'})`;
    });
};

// Turnos pendientes (de ahora en adelante) de un paciente, como texto para mostrar. Sirve para impedir
// desactivarlo mientras tenga turnos: recepción tiene que reprogramarlos o cancelarlos antes.
export const turnosPendientesDePaciente = async (pacienteId: string): Promise<string[]> => {
    const pendientes = await Turno.find({
        paciente: pacienteId,
        activo: { $ne: false },
        estado: EstadoTurno.PENDIENTE,
        fechaFin: { $gt: new Date() },
    }).sort({ fechaTurno: 1 });
    if (pendientes.length === 0) return [];

    const medicos = await Medico.find({ _id: { $in: pendientes.map((t) => t.medico) } }).select('nombre apellido');
    const nombres = new Map(medicos.map((m) => [String(m._id), `${m.apellido ?? ''} ${m.nombre}`.trim()]));

    return pendientes.map((t) => {
        const local = new Date(t.fechaTurno.getTime() + OFFSET_ARGENTINA_MS);
        const dia = `${dosDigitos(local.getUTCDate())}/${dosDigitos(local.getUTCMonth() + 1)}`;
        const hora = `${dosDigitos(local.getUTCHours())}:${dosDigitos(local.getUTCMinutes())}`;
        return `${dia} ${hora} (${nombres.get(String(t.medico)) ?? 'médico'})`;
    });
};