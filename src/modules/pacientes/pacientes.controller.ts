import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Paciente from './Paciente.model';
import type { IActualizarPacienteDTO, ICrearPacienteDTO, IQueryPacientes } from './dtos/Paciente.schema';
import Usuario, { Rol } from '../auth/Usuario.model'; // ajustá si Usuario no es export default
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import { turnosPendientesDePaciente } from '../turnos/turnos.service';
import { validarObraSocial } from '../obrasSociales/obrasSociales.service';

const mensajeError = (error: unknown) => (error instanceof Error ? error.message : null);

// Escapar evita que lo que escribe el usuario en el buscador se interprete como regex
const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 11000 = clave duplicada de MongoDB (otro paciente ya tiene ese DNI)
const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const getPacientes = async (req: Request<unknown, unknown, unknown, IQueryPacientes>, res: Response) => {
    try {
        const { obraSocial, dni, q, sort, order, inactivos } = req.query;
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '10', 10) || 10)); // tope de 50
        const dir = order === 'desc' ? -1 : 1;

        // Por defecto solo los activos (los antiguos sin el campo "activo" cuentan como activos).
        // Con ?inactivos=true se listan solo los desactivados, para poder reactivarlos.
        const filtro: Record<string, unknown> = { activo: inactivos === 'true' ? false : { $ne: false } };
        if (obraSocial) filtro['obraSocial.nombre'] = obraSocial.toUpperCase();
        if (dni) filtro.dni = dni;

        // "juan perez" => cada palabra debe aparecer en nombre, apellido o dni
        const palabras = (q ?? '').trim().split(/\s+/).filter(Boolean);
        if (palabras.length > 0) {
            filtro.$and = palabras.map((palabra) => {
                const rx = new RegExp(escaparRegex(palabra), 'i');
                return { $or: [{ nombre: rx }, { apellido: rx }, { dni: rx }] };
            });
        }

        // Desempate por el otro campo y por _id: sin esto, la paginación puede repetir u omitir filas.
        const orden: Record<string, 1 | -1> =
            sort === 'nombre'
                ? { nombre: dir, apellido: dir, _id: 1 }
                : { apellido: dir, nombre: dir, _id: 1 };

        const [items, total] = await Promise.all([
            Paciente.find(filtro)
                .select('nombre apellido dni telefono obraSocial activo') // la lista no necesita historial ni dirección
                .collation({ locale: 'es', strength: 2 })          // ordena bien tildes y ñ, ignora mayúsculas
                .sort(orden)
                .skip((page - 1) * limit)
                .limit(limit),
            Paciente.countDocuments(filtro),
        ]);

        return respuestaEstandar(res, 200, true, 'Pacientes obtenidos exitosamente', {
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener los pacientes', mensajeError(error));
    }
};

const getPacienteById = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const paciente = await Paciente.findById(req.params.id);
        if (!paciente) return respuestaEstandar(res, 404, false, 'Paciente no encontrado');

        // Solo el ADMIN ve (y puede editar) el usuario de la cuenta de acceso
        // AJUSTAR: cómo tu validarJWT guarda al usuario en la request (req.usuario?.rol).
        const cuenta = req.usuario?.rol === Rol.ADMIN
            ? await Usuario.findOne({ paciente: paciente._id }).select('user')
            : null;

        return respuestaEstandar(res, 200, true, 'Paciente obtenido exitosamente', {
            ...paciente.toJSON(),
            cuenta: cuenta ? { user: cuenta.user } : null,
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener el paciente', mensajeError(error));
    }
};

const createPaciente = async (req: Request<unknown, unknown, ICrearPacienteDTO>, res: Response) => {
    try {
        const { password, user, ...datos } = req.body;

        // La obra social tiene que estar cargada en el catálogo (y activa)
        const obra = await validarObraSocial(datos.obraSocial.nombre);
        if ('error' in obra) return respuestaEstandar(res, 400, false, obra.error);
        datos.obraSocial = { ...datos.obraSocial, nombre: obra.nombre };

        const existente = await Paciente.findOne({ dni: datos.dni });
        if (existente && existente.origen !== 'INGRESO_RAPIDO') {
            return respuestaEstandar(res, 409, false, 'Ya existe un paciente con ese DNI');
        }

        // Si entró antes por ingreso rápido, se completa esa misma ficha
        const paciente = existente ?? new Paciente();
        paciente.set({ ...datos, origen: 'RECEPCION' });
        await paciente.save();

        if (password) {
            try {
                await Usuario.create({
                    user: user ?? paciente.dni, // si recepción no elige usuario, se usa el DNI
                    nombre: paciente.nombre,
                    apellido: paciente.apellido,
                    email: paciente.email,
                    password: await bcrypt.hash(password, 10), // el modelo no encripta: se hace acá, igual que en registrarUsuario
                    rol: Rol.PACIENTE,
                    paciente: paciente._id,
                });
            } catch (error) {
                if (!existente) await paciente.deleteOne(); // no dejar paciente sin cuenta si falla
                throw error;
            }
        }

        return respuestaEstandar(res, existente ? 200 : 201, true, 'Paciente guardado exitosamente', paciente);
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'El email o el usuario ya están registrados');
        }
        return respuestaEstandar(res, 500, false, 'Error al crear el paciente', mensajeError(error));
    }
};

const modificarPaciente = async (req: Request<{ id: string }, unknown, IActualizarPacienteDTO>, res: Response) => {
    try {
        const paciente = await Paciente.findById(req.params.id);
        if (!paciente) {
            return respuestaEstandar(res, 404, false, 'Paciente no encontrado');
        }

        // Lista blanca: solo estos campos se pueden editar, aunque el body traiga otros
        // (activo, historialMedico, origen...). DNI, email, usuario y contraseña son datos de
        // la cuenta de acceso: solo los cambia el ADMIN.
        // AJUSTAR: cómo tu validarJWT guarda al usuario en la request (req.usuario?.rol).
        const esAdmin = req.usuario?.rol === Rol.ADMIN;
        const { nombre, apellido, fechaNacimiento, direccion, telefono, obraSocial, dni, email, user, password } = req.body;

        // Si cambia la obra social, tiene que estar en el catálogo (puede conservar la que ya tenía aunque la hayan desactivado)
        let obraSocialValida = obraSocial;
        if (obraSocial) {
            const obra = await validarObraSocial(obraSocial.nombre, paciente.obraSocial?.nombre);
            if ('error' in obra) return respuestaEstandar(res, 400, false, obra.error);
            obraSocialValida = { ...obraSocial, nombre: obra.nombre };
        }
        const permitidos = { nombre, apellido, fechaNacimiento, direccion, telefono, obraSocial: obraSocialValida, ...(esAdmin ? { dni, email } : {}) };

        // Se descartan los undefined: si no, mongoose borraría esos campos del documento
        paciente.set(Object.fromEntries(Object.entries(permitidos).filter(([, valor]) => valor !== undefined)));
        await paciente.save();

        if (esAdmin) {
            const cuenta = await Usuario.findOne({ paciente: paciente._id });
            if (cuenta) {
                cuenta.nombre = paciente.nombre;
                cuenta.apellido = paciente.apellido;
                cuenta.email = paciente.email;
                if (user) cuenta.user = user;
                if (password) cuenta.password = await bcrypt.hash(password, 10);
                await cuenta.save();
            } else if (password) {
                // Paciente sin cuenta (por ejemplo, vino por ingreso rápido): el admin se la crea
                await Usuario.create({
                    user: user ?? paciente.dni,
                    nombre: paciente.nombre,
                    apellido: paciente.apellido,
                    email: paciente.email,
                    password: await bcrypt.hash(password, 10), // el modelo no encripta: se hace acá, igual que en registrarUsuario
                    rol: Rol.PACIENTE,
                    paciente: paciente._id,
                });
            }
        }

        return respuestaEstandar(res, 200, true, 'Paciente modificado correctamente', paciente);
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'Ya existe otro registro con ese DNI, usuario o email');
        }
        return respuestaEstandar(res, 500, false, 'Error al modificar el paciente', mensajeError(error));
    }
};

const desactivarPaciente = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const paciente = await Paciente.findById(req.params.id);
        if (!paciente) {
            return respuestaEstandar(res, 404, false, 'Paciente no encontrado');
        }

        // Con turnos pendientes no se puede desactivar: primero hay que reprogramarlos o cancelarlos
        const pendientes = await turnosPendientesDePaciente(String(paciente._id));
        if (pendientes.length > 0) {
            const lista = pendientes.slice(0, 5).join('; ');
            const resto = pendientes.length > 5 ? ` y ${pendientes.length - 5} más` : '';
            return respuestaEstandar(
                res, 409, false,
                `No se puede desactivar: el paciente tiene ${pendientes.length} turno(s) pendiente(s): ${lista}${resto}. Reprogramalos o cancelalos primero.`,
            );
        }

        paciente.activo = false;
        await paciente.save();
        // Sin esto, un paciente desactivado podría seguir ingresando con su cuenta
        await Usuario.updateMany({ paciente: paciente._id }, { activo: false });
        return respuestaEstandar(res, 200, true, 'Paciente desactivado correctamente', paciente);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al desactivar el paciente', mensajeError(error));
    }
};

const reactivarPaciente = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const paciente = await Paciente.findById(req.params.id);
        if (!paciente) {
            return respuestaEstandar(res, 404, false, 'Paciente no encontrado');
        }
        paciente.activo = true;
        await paciente.save();
        // Se vuelve a habilitar su cuenta de acceso (si tiene)
        await Usuario.updateMany({ paciente: paciente._id }, { activo: true });
        return respuestaEstandar(res, 200, true, 'Paciente reactivado correctamente', paciente);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al reactivar el paciente', mensajeError(error));
    }
};

// No hay borrado definitivo desde la app: el paciente conserva su historia clínica y sus turnos.
// Si alguna vez hace falta (por ejemplo, un alta por error), se borra a mano desde la base de datos.
export { getPacientes, getPacienteById, createPaciente, desactivarPaciente, reactivarPaciente, modificarPaciente };