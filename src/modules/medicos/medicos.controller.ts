import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Error as MongooseError } from 'mongoose';
import Medico from './Medico.model.js';
import Usuario, { Rol } from '../auth/Usuario.model.js';
import Consultorio from '../consultorios/Consultorio.model.js';
import { atiendeEspecialidad } from '../consultorios/atiendeEspecialidad.js';
import { turnosFueraDeHorario, turnosPendientesEnRango } from '../turnos/turnos.service.js';
import { errorDeRango, type IRangoDTO } from '../../utils/rangoFechas.js';
import { NOMBRES_DIA } from '../../utils/franja.schema.js';
import type {
    IActualizarHorarioDTO,
    IActualizarMedicoDTO,
    IActualizarPerfilMedicoDTO,
    ICambiarPasswordMedicoDTO,
    ICrearMedicoDTO,
    IQueryMedicos,
} from './dtos/medico.schema.js';

import { respuestaEstandar } from '../../utils/respuestaEstandar.js';

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error del servidor';

// 11000 = clave duplicada de MongoDB (DNI, matrícula o email ya usados por otro médico)
const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

// Controla que los consultorios elegidos existan, tengan la especialidad del médico y estén activos
// (los que el médico ya tenía asignados se aceptan aunque se hayan desactivado, para poder quitarlos).
// Devuelve el mensaje de error, o null si está todo bien.
const validarConsultorios = async (ids: string[], especialidadId: string, yaAsignados: string[]) => {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return null;

    const consultorios = await Consultorio.find({ _id: { $in: unicos } }).select('+activo nombre especialidades todasLasEspecialidades');
    if (consultorios.length !== unicos.length) return 'Alguno de los consultorios elegidos no existe';

    for (const consultorio of consultorios) {
        if (!atiendeEspecialidad(consultorio, especialidadId)) {
            return `El consultorio ${consultorio.nombre} no tiene la especialidad del médico`;
        }
        if (consultorio.activo === false && !yaAsignados.includes(String(consultorio._id))) {
            return `El consultorio ${consultorio.nombre} está inactivo`;
        }
    }
    return null;
};

const getMedicos = async (req: Request<unknown, unknown, unknown, IQueryMedicos>, res: Response) => {
    try {
        // ?especialidad=<id>&dni=12345678&consultorio=<id>&activo=true
        const { especialidad, dni, consultorio, activo } = req.query;

        const filtro: Record<string, unknown> = {};

        if (especialidad) {
            filtro.especialidad = especialidad;
        }

        if (dni) {
            filtro.dni = dni;
        }

        // Médicos que atienden en ese consultorio
        if (consultorio) {
            filtro.consultorios = consultorio;
        }

        // Sin ?activo se devuelven todos (la lista de administración muestra el estado de cada uno).
        // Las pantallas de turnos piden ?activo=true. { $ne: false } incluye a los médicos viejos sin el campo.
        if (activo) {
            filtro.activo = activo === 'true' ? { $ne: false } : false;
        }

        // "activo" tiene select:false en el modelo: sin '+activo' nunca llegaría al front
        const medicos = await Medico.find(filtro).select('+activo').populate('especialidad').populate('consultorios', 'nombre').populate('consultorioHabitual', 'nombre');

        return respuestaEstandar(res, 200, true, 'Médicos obtenidos exitosamente', medicos);

    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener los médicos', mensajeDeError(error));
    }
};

const getMedicoById = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const medico = await Medico.findById(req.params.id).select('+activo').populate('especialidad').populate('consultorios', 'nombre').populate('consultorioHabitual', 'nombre');

        if (!medico) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        // Solo el ADMIN ve (y puede editar) el usuario de la cuenta de acceso
        const cuenta = req.usuario?.rol === Rol.ADMIN
            ? await Usuario.findOne({ medico: medico._id }).select('user')
            : null;

        return respuestaEstandar(res, 200, true, 'Médico obtenido exitosamente', {
            ...medico.toJSON(),
            cuenta: cuenta ? { user: cuenta.user } : null,
        });

    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

const createMedico = async (req: Request<unknown, unknown, ICrearMedicoDTO>, res: Response) => {
    try {
        const { acceso, ...datosMedico } = req.body;

        if (!acceso) {
            return respuestaEstandar(res, 400, false, 'Faltan los datos de acceso del médico');
        }

        const existeUsuario = await Usuario.findOne({
            $or: [{ email: datosMedico.email }, { user: acceso.user }],
        });
        if (existeUsuario) {
            return respuestaEstandar(res, 400, false, 'el mail o el usuario ya estan registrados');
        }

        const errorConsultorios = await validarConsultorios(datosMedico.consultorios, datosMedico.especialidad, []);
        if (errorConsultorios) {
            return respuestaEstandar(res, 400, false, errorConsultorios);
        }
        if (datosMedico.consultorioHabitual && !datosMedico.consultorios.includes(datosMedico.consultorioHabitual)) {
            return respuestaEstandar(res, 400, false, 'El consultorio habitual tiene que estar entre los consultorios del médico');
        }

        // Con exactOptionalPropertyTypes no se puede pasar consultorioHabitual: undefined; solo se incluye si tiene valor
        const { consultorioHabitual, ...resto } = datosMedico;
        const nuevoMedico = await Medico.create({
            ...resto,
            ...(consultorioHabitual ? { consultorioHabitual } : {}),
        });

        try {
            await Usuario.create({
                email: nuevoMedico.email,
                user: acceso.user,
                password: await bcrypt.hash(acceso.password, 10),
                rol: Rol.MEDICO,
                medico: nuevoMedico._id,
            });
        } catch (error: unknown) {
            // Si falla la cuenta, no dejamos un médico huérfano sin acceso
            await Medico.findByIdAndDelete(nuevoMedico._id);
            throw error;
        }

        return respuestaEstandar(res, 201, true, 'Médico creado exitosamente', nuevoMedico);

    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'Ya existe un médico con ese DNI, matrícula o email');
        }
        return respuestaEstandar(res, 500, false, 'Error al crear el médico', mensajeDeError(error));
    }
};

const updateMedico = async (req: Request<{ id: string }, unknown, IActualizarMedicoDTO>, res: Response) => {
    try {
        const { id } = req.params;
        const { acceso, nombre, apellido, dni, fechaNacimiento, especialidad, consultorios, consultorioHabitual, matricula, telefono, email, activo } = req.body;

        // Si cambian la especialidad o los consultorios, se controla el resultado final:
        // todos los consultorios del médico tienen que tener su especialidad.
        if (especialidad !== undefined || consultorios !== undefined || consultorioHabitual !== undefined) {
            const actual = await Medico.findById(id).select('especialidad consultorios consultorioHabitual horarioAtencion');
            if (!actual) {
                return respuestaEstandar(res, 404, false, 'Médico no encontrado');
            }
            const asignados = actual.consultorios.map((c) => String(c));
            const errorConsultorios = await validarConsultorios(
                consultorios ?? asignados,
                especialidad ?? String(actual.especialidad),
                asignados
            );
            if (errorConsultorios) {
                return respuestaEstandar(res, 400, false, errorConsultorios);
            }

            // El consultorio habitual (el que viene o el que ya tenía) tiene que seguir entre sus consultorios
            const habitualFinal =
                consultorioHabitual === undefined
                    ? (actual.consultorioHabitual ? String(actual.consultorioHabitual) : '')
                    : (consultorioHabitual ?? '');
            if (habitualFinal && !(consultorios ?? asignados).includes(habitualFinal)) {
                return respuestaEstandar(res, 400, false, 'El consultorio habitual tiene que estar entre los consultorios del médico');
            }

            // No se puede quitar un consultorio en el que el médico tiene horarios cargados
            if (consultorios !== undefined) {
                const conservados = new Set(consultorios);
                const horarioEnConsultorioQuitado = (actual.horarioAtencion?.franjas ?? []).some(
                    (f) => f.consultorio && !conservados.has(String(f.consultorio))
                );
                if (horarioEnConsultorioQuitado) {
                    return respuestaEstandar(
                        res, 409, false,
                        'No se puede quitar un consultorio en el que el médico tiene horarios cargados. Borralos primero desde Horario de atención.'
                    );
                }
            }
        }

        // Lista blanca: solo estos campos se editan, aunque el body traiga otros. undefined = no se toca.
        const cambios = Object.fromEntries(
            Object.entries({ nombre, apellido, dni, fechaNacimiento, especialidad, consultorios, consultorioHabitual, matricula, telefono, email, activo })
                .filter(([, valor]) => valor !== undefined)
        );

        const medicoActualizado = await Medico.findByIdAndUpdate(id, cambios, {
            new: true,
            runValidators: true,
        }).select('+activo');

        if (!medicoActualizado) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        // La cuenta de acceso sigue al médico: mismo email, mismo estado (así al reactivarlo vuelve a poder ingresar)
        // y, si el admin lo pide, nuevo usuario o contraseña.
        const cuenta = await Usuario.findOne({ medico: medicoActualizado._id });
        if (cuenta) {
            cuenta.email = medicoActualizado.email;
            if (typeof activo === 'boolean') cuenta.activo = activo;
            if (acceso?.user) cuenta.user = acceso.user;
            if (acceso?.password) cuenta.password = await bcrypt.hash(acceso.password, 10);
            await cuenta.save();
        } else if (acceso?.user && acceso.password) {
            // Médico sin cuenta: se la crea el admin
            await Usuario.create({
                email: medicoActualizado.email,
                user: acceso.user,
                password: await bcrypt.hash(acceso.password, 10),
                rol: Rol.MEDICO,
                medico: medicoActualizado._id,
            });
        }

        return respuestaEstandar(res, 200, true, 'Médico actualizado exitosamente', medicoActualizado);

    } catch (error: unknown) {
        if (error instanceof MongooseError.ValidationError) {
            const errores = Object.values(error.errors).map((err) => err.message);
            return respuestaEstandar(res, 400, false, 'Error de validación', errores);
        }

        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'Ya existe otro registro con ese DNI, matrícula, email o usuario');
        }

        return respuestaEstandar(res, 400, false, 'Error al actualizar el médico', mensajeDeError(error));
    }
};

// NUEVO: reemplaza el horario de atención semanal completo del médico
const actualizarHorarioMedico = async (
    req: Request<{ id: string }, unknown, IActualizarHorarioDTO>,
    res: Response
) => {
    try {
        const medico = await Medico.findById(req.params.id).select('consultorios especialidad');

        if (!medico) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        const { franjas } = req.body;
        const asignados = medico.consultorios.map((c) => String(c));
        const ids = [...new Set(franjas.map((f) => f.consultorio))];
        const consultorios = await Consultorio.find({ _id: { $in: ids } }).select('+activo nombre horarioAtencion especialidades todasLasEspecialidades');

        // 1) Se puede elegir cualquier consultorio activo que tenga la especialidad del médico.
        //    Los que todavía no tenía asignados se le suman solos al guardar.
        if (consultorios.length !== ids.length) {
            return respuestaEstandar(res, 400, false, 'Alguno de los consultorios elegidos no existe');
        }
        for (const c of consultorios) {
            if (c.activo === false) {
                return respuestaEstandar(res, 400, false, `El consultorio ${c.nombre} está desactivado`);
            }
            if (!atiendeEspecialidad(c, String(medico.especialidad))) {
                return respuestaEstandar(res, 400, false, `El consultorio ${c.nombre} no atiende la especialidad del médico`);
            }
        }

        // 2) Cada franja tiene que quedar dentro del horario de atención de su consultorio.

        for (const franja of franjas) {
            const consultorio = consultorios.find((c) => String(c._id) === franja.consultorio);
            const dentro = consultorio?.horarioAtencion.franjas.some(
                (h) => h.diaSemana === franja.diaSemana && h.desde <= franja.desde && franja.hasta <= h.hasta
            );
            if (!consultorio || !dentro) {
                return respuestaEstandar(
                    res, 400, false,
                    `El horario del ${NOMBRES_DIA[franja.diaSemana]} de ${franja.desde} a ${franja.hasta} queda fuera del horario de atención del consultorio ${consultorio?.nombre ?? ''}`.trim()
                );
            }
        }

        // 3) En un mismo consultorio no pueden atender dos médicos a la misma hora (un médico atiende
        //    de mañana y otro de tarde, por ejemplo). Los médicos desactivados no cuentan.
        const otrosMedicos = await Medico.find({
            _id: { $ne: medico._id },
            activo: { $ne: false },
            'horarioAtencion.franjas.consultorio': { $in: ids },
        }).select('nombre apellido horarioAtencion');

        for (const franja of franjas) {
            for (const otro of otrosMedicos) {
                const choque = (otro.horarioAtencion?.franjas ?? []).find(
                    (f) =>
                        String(f.consultorio) === franja.consultorio &&
                        f.diaSemana === franja.diaSemana &&
                        f.desde < franja.hasta &&
                        franja.desde < f.hasta
                );
                if (choque) {
                    const consultorio = consultorios.find((c) => String(c._id) === franja.consultorio);
                    return respuestaEstandar(
                        res, 409, false,
                        `El consultorio ${consultorio?.nombre ?? ''} ya está ocupado el ${NOMBRES_DIA[franja.diaSemana]} de ${choque.desde} a ${choque.hasta} por ${otro.apellido}, ${otro.nombre}`
                    );
                }
            }
        }

        // 4) No se puede quitar ni acortar un horario si hay turnos pendientes que quedarían afuera:
        //    recepción tiene que reprogramarlos o cancelarlos primero.
        const afectados = await turnosFueraDeHorario(String(medico._id), franjas);
        if (afectados.length > 0) {
            const lista = afectados.slice(0, 5).join('; ');
            const resto = afectados.length > 5 ? ` y ${afectados.length - 5} más` : '';
            return respuestaEstandar(
                res, 409, false,
                `No se puede guardar: ${afectados.length} turno(s) pendiente(s) quedarían fuera del nuevo horario: ${lista}${resto}. Reprogramalos o cancelalos antes de cambiar el horario.`,
            );
        }

        const nuevos = ids.filter((id) => !asignados.includes(id));
        const medicoActualizado = await Medico.findByIdAndUpdate(
            req.params.id,
            { horarioAtencion: req.body, ...(nuevos.length > 0 && { $addToSet: { consultorios: { $each: nuevos } } }) },
            { new: true, runValidators: true }
        ).populate('especialidad').populate('consultorios', 'nombre').populate('consultorioHabitual', 'nombre');

        return respuestaEstandar(res, 200, true, 'Horario de atención actualizado exitosamente', medicoActualizado);

    } catch (error: unknown) {
        if (error instanceof MongooseError.ValidationError) {
            const errores = Object.values(error.errors).map((err) => err.message);
            return respuestaEstandar(res, 400, false, 'Error de validación', errores);
        }

        return respuestaEstandar(res, 400, false, 'Error al actualizar el horario', mensajeDeError(error));
    }
};

// MI PERFIL: el médico cambia solo su teléfono. El id sale del token (ver medicoDelToken), nunca del body.
const actualizarPerfilMedico = async (req: Request<{ id: string }, unknown, IActualizarPerfilMedicoDTO>, res: Response) => {
    try {
        const medico = await Medico.findByIdAndUpdate(
            req.params.id,
            { telefono: req.body.telefono },
            { new: true, runValidators: true },
        ).select('+activo').populate('especialidad').populate('consultorios', 'nombre').populate('consultorioHabitual', 'nombre');

        if (!medico) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }
        return respuestaEstandar(res, 200, true, 'Perfil actualizado correctamente', medico);
    } catch (error: unknown) {
        if (error instanceof MongooseError.ValidationError) {
            const errores = Object.values(error.errors).map((err) => err.message);
            return respuestaEstandar(res, 400, false, 'Error de validación', errores);
        }
        return respuestaEstandar(res, 500, false, 'Error al actualizar el perfil', mensajeDeError(error));
    }
};

// MI PERFIL: cambiar la propia contraseña, pidiendo la actual
const cambiarPasswordMedico = async (req: Request<unknown, unknown, ICambiarPasswordMedicoDTO>, res: Response) => {
    try {
        const usuario = await Usuario.findById(req.usuario?.id);
        if (!usuario) {
            return respuestaEstandar(res, 404, false, 'Usuario no encontrado');
        }

        const esCorrecta = await bcrypt.compare(req.body.passwordActual, usuario.password);
        if (!esCorrecta) {
            return respuestaEstandar(res, 400, false, 'La contraseña actual no es correcta');
        }

        usuario.password = await bcrypt.hash(req.body.passwordNueva, 10);
        await usuario.save();
        return respuestaEstandar(res, 200, true, 'Contraseña actualizada correctamente');
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al cambiar la contraseña', mensajeDeError(error));
    }
};

// NUEVO: horarios que otros médicos tienen en los consultorios de este médico.
// Sirve para avisar, mientras se carga su horario, que un consultorio ya está ocupado a esa hora.
const getOcupacionMedico = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const medico = await Medico.findById(req.params.id).select('especialidad');
        if (!medico) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        // Consultorios que el médico puede elegir: los activos que tienen su especialidad
        const elegibles = await Consultorio.find({ $or: [{ especialidades: medico.especialidad }, { todasLasEspecialidades: true }], activo: { $ne: false } }).select('_id');
        const idsElegibles = elegibles.map((c) => c._id);

        const otros = await Medico.find({
            _id: { $ne: medico._id },
            activo: { $ne: false },
            'horarioAtencion.franjas.consultorio': { $in: idsElegibles },
        }).select('nombre apellido horarioAtencion');

        const ocupacion = otros.flatMap((otro) =>
            (otro.horarioAtencion?.franjas ?? [])
                .filter((f) => idsElegibles.some((c) => c.equals(f.consultorio)))
                .map((f) => ({
                    consultorio: String(f.consultorio),
                    diaSemana: f.diaSemana,
                    desde: f.desde,
                    hasta: f.hasta,
                    medico: { id: otro.id, nombre: otro.nombre, apellido: otro.apellido },
                }))
        );

        return respuestaEstandar(res, 200, true, 'Ocupación obtenida exitosamente', ocupacion);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

const desactivarMedico = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const medico = await Medico.findByIdAndUpdate(req.params.id, { activo: false }, { new: true });

        if (!medico) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        // Sin cuenta activa, el login del médico queda bloqueado
        await Usuario.updateOne({ medico: medico._id }, { activo: false });

        return respuestaEstandar(res, 200, true, 'Médico desactivado correctamente', medico);

    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

// Alias para no romper las rutas que ya apuntan a deleteMedico
const deleteMedico = desactivarMedico;

// AUSENCIAS: fechas en las que el médico no atiende (vacaciones, un viaje, un día suelto).
// Hasta 15 días seguidos por carga; esos días no se ofrecen turnos. Si ya hay turnos pendientes en esas fechas,
// no se guarda: primero hay que reprogramarlos o cancelarlos.
const agregarAusenciaMedico = async (req: Request<{ id: string }, unknown, IRangoDTO>, res: Response) => {
    try {
        const medico = await Medico.findById(req.params.id).select('+activo ausencias');
        if (!medico || medico.activo === false) {
            return respuestaEstandar(res, 404, false, 'Médico no encontrado');
        }

        const { desde, hasta, motivo } = req.body;
        const error = errorDeRango({ desde, hasta }, medico.ausencias ?? []);
        if (error) return respuestaEstandar(res, 400, false, error);

        const afectados = await turnosPendientesEnRango('medico', String(medico._id), desde, hasta);
        if (afectados.length > 0) {
            return respuestaEstandar(
                res, 409, false,
                `No se puede guardar: ${afectados.length} turno(s) pendiente(s) caen en esas fechas: ${afectados.join(', ')}. Reprogramalos o cancelalos antes de cargar la ausencia.`,
            );
        }

        const actualizado = await Medico.findByIdAndUpdate(
            medico._id,
            { $push: { ausencias: { desde, hasta, motivo } } },
            { new: true },
        ).select('ausencias');

        return respuestaEstandar(res, 201, true, 'Ausencia cargada correctamente', actualizado?.toJSON().ausencias ?? []);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al cargar la ausencia', mensajeDeError(error));
    }
};

const quitarAusenciaMedico = async (req: Request<{ id: string; ausenciaId: string }>, res: Response) => {
    try {
        const actualizado = await Medico.findByIdAndUpdate(
            req.params.id,
            { $pull: { ausencias: { _id: req.params.ausenciaId } } },
            { new: true },
        ).select('ausencias');
        if (!actualizado) return respuestaEstandar(res, 404, false, 'Médico no encontrado');

        return respuestaEstandar(res, 200, true, 'Ausencia quitada correctamente', actualizado.toJSON().ausencias ?? []);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'No se pudo quitar la ausencia', mensajeDeError(error));
    }
};

export {
    agregarAusenciaMedico,
    quitarAusenciaMedico,
    getMedicos,
    getMedicoById,
    createMedico,
    updateMedico,
    actualizarHorarioMedico,
    actualizarPerfilMedico,
    cambiarPasswordMedico,
    getOcupacionMedico,
    desactivarMedico,
    deleteMedico,
};