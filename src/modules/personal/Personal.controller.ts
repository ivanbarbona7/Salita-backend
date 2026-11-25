import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import Usuario, { Rol } from '../auth/Usuario.model';
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import type { IActualizarPersonalDTO, ICrearPersonalDTO, IQueryPersonal } from './dtos/personal.schema';

const mensajeDeError = (error: unknown) => (error instanceof Error ? error.message : 'Error del servidor');

const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Personal" = administradores y recepcionistas (los médicos y pacientes tienen su propio módulo)
const SOLO_PERSONAL = { rol: { $in: [Rol.ADMIN, Rol.RECEPCIONISTA] } };

// Qué datos ve cada uno. La contraseña nunca sale. La recepción ve lo básico y de contacto;
// el DNI, la fecha de nacimiento, la fecha de ingreso y el usuario de acceso son solo del administrador.
const CAMPOS_ADMIN = 'nombre apellido email user rol activo dni fechaNacimiento telefono fechaIngreso turno createdAt';
const CAMPOS_RECEPCION = 'nombre apellido email rol activo telefono turno';

const esAdmin = (req: Request<any, any, any, any>) => req.usuario?.rol === Rol.ADMIN;
const camposSegunRol = (req: Request<any, any, any, any>) => (esAdmin(req) ? CAMPOS_ADMIN : CAMPOS_RECEPCION);

// Id de quien hace el pedido (sale del token)
const idDelSolicitante = (req: Request<any, any, any, any>) => String((req.usuario as { id?: unknown } | undefined)?.id ?? '');

// El front trabaja con "id", no con "_id"
const conId = <T extends { _id: unknown }>({ _id, ...resto }: T) => ({ id: String(_id), ...resto });

const getPersonal = async (req: Request<unknown, unknown, unknown, IQueryPersonal>, res: Response) => {
    try {
        const { q, inactivos } = req.query;

        const filtro: Record<string, unknown> = {
            ...SOLO_PERSONAL,
            activo: inactivos === 'true' ? false : { $ne: false },
        };

        // "ana lopez" => cada palabra tiene que aparecer en nombre, apellido o email (y DNI, solo para el admin)
        const palabras = (q ?? '').trim().split(/\s+/).filter(Boolean);
        if (palabras.length > 0) {
            filtro.$and = palabras.map((palabra) => {
                const rx = new RegExp(escaparRegex(palabra), 'i');
                const campos = [{ nombre: rx }, { apellido: rx }, { email: rx }, ...(esAdmin(req) ? [{ dni: rx }] : [])];
                return { $or: campos };
            });
        }

        const personal = await Usuario.find(filtro)
            .select(camposSegunRol(req))
            .collation({ locale: 'es', strength: 2 })
            .sort({ apellido: 1, nombre: 1, _id: 1 })
            .limit(300)
            .lean();

        return respuestaEstandar(res, 200, true, 'Personal obtenido exitosamente', personal.map(conId));
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener el personal', mensajeDeError(error));
    }
};

const getPersonalById = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const persona = await Usuario.findOne({ _id: req.params.id, ...SOLO_PERSONAL }).select(camposSegunRol(req)).lean();
        if (!persona) return respuestaEstandar(res, 404, false, 'Persona no encontrada');
        return respuestaEstandar(res, 200, true, 'Persona obtenida exitosamente', conId(persona));
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

// Solo ADMIN
const crearPersonal = async (req: Request<unknown, unknown, ICrearPersonalDTO>, res: Response) => {
    try {
        const { password, turno, fechaIngreso, ...datos } = req.body;

        const existente = await Usuario.findOne({
            $or: [{ email: datos.email }, { user: datos.user }, { dni: datos.dni }],
        }).select('email user dni');
        if (existente) {
            const motivo =
                existente.dni === datos.dni ? 'el DNI' : existente.email === datos.email ? 'el email' : 'el usuario';
            return respuestaEstandar(res, 409, false, `Ya hay una persona registrada con ${motivo} indicado`);
        }

        const nuevo = await Usuario.create({
            ...datos,
            ...(turno ? { turno } : {}),
            ...(fechaIngreso ? { fechaIngreso } : {}),
            password: await bcrypt.hash(password, 10),
        });

        return respuestaEstandar(res, 201, true, 'Personal cargado correctamente', {
            id: String(nuevo._id),
            email: nuevo.email,
            user: nuevo.user,
            rol: nuevo.rol,
        });
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'El DNI, el email o el usuario ya están registrados');
        }
        return respuestaEstandar(res, 500, false, 'Error al cargar el personal', mensajeDeError(error));
    }
};

// Solo ADMIN. Lista blanca: solo estos campos se editan, aunque el body traiga otros (rol, activo...).
const modificarPersonal = async (req: Request<{ id: string }, unknown, IActualizarPersonalDTO>, res: Response) => {
    try {
        const persona = await Usuario.findOne({ _id: req.params.id, ...SOLO_PERSONAL });
        if (!persona) return respuestaEstandar(res, 404, false, 'Persona no encontrada');

        const { nombre, apellido, dni, fechaNacimiento, telefono, email, user, password, turno, fechaIngreso } = req.body;

        // Se descartan los undefined: si no, mongoose borraría esos campos
        const cambios = Object.entries({ nombre, apellido, dni, fechaNacimiento, telefono, email, user }).filter(
            ([, valor]) => valor !== undefined,
        );
        persona.set(Object.fromEntries(cambios));
        // null = borrar el dato (undefined en mongoose = quitar el campo)
        if (turno !== undefined) persona.set('turno', turno ?? undefined);
        if (fechaIngreso !== undefined) persona.set('fechaIngreso', fechaIngreso ?? undefined);
        if (password) persona.password = await bcrypt.hash(password, 10);

        await persona.save();
        return respuestaEstandar(res, 200, true, 'Datos del personal actualizados', { id: String(persona._id) });
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) {
            return respuestaEstandar(res, 409, false, 'Ya hay otra persona con ese DNI, email o usuario');
        }
        return respuestaEstandar(res, 500, false, 'Error al modificar el personal', mensajeDeError(error));
    }
};

// Solo ADMIN. No se borra: se desactiva (no puede ingresar, pero queda su registro).
const desactivarPersonal = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const persona = await Usuario.findOne({ _id: req.params.id, ...SOLO_PERSONAL });
        if (!persona) return respuestaEstandar(res, 404, false, 'Persona no encontrada');

        if (String(persona._id) === idDelSolicitante(req)) {
            return respuestaEstandar(res, 400, false, 'No podés desactivar tu propia cuenta');
        }
        // Siempre tiene que quedar al menos un administrador activo
        if (persona.rol === Rol.ADMIN && persona.activo !== false) {
            const otros = await Usuario.countDocuments({ rol: Rol.ADMIN, activo: { $ne: false }, _id: { $ne: persona._id } });
            if (otros === 0) {
                return respuestaEstandar(res, 409, false, 'Tiene que quedar al menos un administrador activo');
            }
        }

        persona.activo = false;
        await persona.save();
        return respuestaEstandar(res, 200, true, 'Persona desactivada', { id: String(persona._id) });
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

const reactivarPersonal = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const persona = await Usuario.findOne({ _id: req.params.id, ...SOLO_PERSONAL });
        if (!persona) return respuestaEstandar(res, 404, false, 'Persona no encontrada');

        persona.activo = true;
        await persona.save();
        return respuestaEstandar(res, 200, true, 'Persona reactivada', { id: String(persona._id) });
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', mensajeDeError(error));
    }
};

export { getPersonal, getPersonalById, crearPersonal, modificarPersonal, desactivarPersonal, reactivarPersonal };