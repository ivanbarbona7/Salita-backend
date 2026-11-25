import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Usuario, { Rol } from './Usuario.model';
import { respuestaEstandar } from '../../utils/respuestaEstandar';

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error del servidor';

const ROLES_VALIDOS = Object.values(Rol);

export const registrarUsuario = async (req: Request, res: Response) => {
    try {
        const { nombre, apellido, email, user, password, rol, pacienteId } = req.body;
        const solicitante = req.usuario?.rol;

        if (!email || !user || !password || !ROLES_VALIDOS.includes(rol)) {
            return respuestaEstandar(res, 400, false, 'Faltan datos o el rol no es válido');
        }
        if (password.length < 8) {
            return respuestaEstandar(res, 400, false, 'La contraseña debe tener al menos 8 caracteres');
        }

        if (rol === Rol.PACIENTE) {
            if (solicitante !== Rol.ADMIN && solicitante !== Rol.RECEPCIONISTA) {
                return respuestaEstandar(res, 403, false, 'No tenés permiso para crear cuentas de paciente');
            }
            if (!pacienteId) {
                return respuestaEstandar(res, 400, false, 'Falta el paciente al que pertenece la cuenta');
            }
        } else if (solicitante !== Rol.ADMIN) {
            return respuestaEstandar(res, 403, false, 'Solo un administrador puede crear personal');
        }

        const existeUsuario = await Usuario.findOne({ $or: [{ email }, { user }] });
        if (existeUsuario) {
            return respuestaEstandar(res, 400, false, 'el mail o el usuario ya estan registrados');
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const nuevoUsuario = await Usuario.create({
            nombre,
            apellido,
            email,
            user,
            password: passwordHash,
            rol,
            ...(rol === Rol.PACIENTE && { paciente: pacienteId }),
        });

        return respuestaEstandar(res, 201, true, 'Usuario creado', {
            id: nuevoUsuario._id,
            email: nuevoUsuario.email,
            user: nuevoUsuario.user,
            rol: nuevoUsuario.rol,
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'error del servidor', mensajeDeError(error));
    }
};

export const loginUsuario = async (req: Request, res: Response) => {
    try {
        const { email, user, password } = req.body;

        const usuario = await Usuario.findOne({ email, user, activo: true });
        if (!usuario) {
            return respuestaEstandar(res, 401, false, 'Credenciales invalidas');
        }

        const esValido = await bcrypt.compare(password, usuario.password);
        if (!esValido) {
            return respuestaEstandar(res, 401, false, 'Credenciales invalidas');
        }

        if (usuario.rol === Rol.PACIENTE && !usuario.paciente) {
            return respuestaEstandar(res, 403, false, 'La cuenta no tiene un paciente asociado');
        }
        if (usuario.rol === Rol.MEDICO && !usuario.medico) {
            return respuestaEstandar(res, 403, false, 'La cuenta no tiene un médico asociado');
        }

        const payload = {
            id: usuario._id,
            user: usuario.user,
            rol: usuario.rol,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            activo: usuario.activo,
            ...(usuario.rol === Rol.PACIENTE && { pacienteId: String(usuario.paciente) }),
            ...(usuario.rol === Rol.MEDICO && usuario.medico && { medicoId: String(usuario.medico) }),
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
            expiresIn: usuario.rol === Rol.PACIENTE ? '2h' : '8h',
        });

        return respuestaEstandar(res, 200, true, 'login exitoso', { token });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'error del servidor', mensajeDeError(error));
    }
};