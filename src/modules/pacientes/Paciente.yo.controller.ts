import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Error as MongooseError } from 'mongoose';
import Paciente from './Paciente.model';
import Usuario from '../auth/Usuario.model';
import type { IActualizarPerfilPacienteDTO, ICambiarPasswordPacienteDTO } from './dtos/Paciente.perfil.schema';
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import { validarObraSocial } from '../obrasSociales/obrasSociales.service';

// Perfil del PACIENTE con cuenta. El paciente siempre sale del token, nunca de la URL ni del body.

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error del servidor';

const CAMPOS_PERFIL = 'nombre apellido dni fechaNacimiento email direccion telefono obraSocial';

const getMiPerfil = async (req: Request, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const paciente = await Paciente.findOne({ _id: pacienteId, activo: { $ne: false } }).select(CAMPOS_PERFIL);
        if (!paciente) return respuestaEstandar(res, 404, false, 'Paciente no encontrado');

        return respuestaEstandar(res, 200, true, 'Perfil obtenido exitosamente', paciente);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error del servidor', mensajeDeError(error));
    }
};

// Solo teléfono, dirección y obra social. Lo demás que llegue en el body se ignora (lista blanca por el schema).
const actualizarMiPerfil = async (req: Request<unknown, unknown, IActualizarPerfilPacienteDTO>, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const { telefono, direccion, obraSocial } = req.body;

        // La obra social tiene que estar en el catálogo (puede conservar la que ya tenía aunque la hayan desactivado)
        const actual = await Paciente.findOne({ _id: pacienteId, activo: { $ne: false } }).select('obraSocial');
        if (!actual) return respuestaEstandar(res, 404, false, 'Paciente no encontrado');
        const obra = await validarObraSocial(obraSocial.nombre, actual.obraSocial?.nombre);
        if ('error' in obra) return respuestaEstandar(res, 400, false, obra.error);

        const paciente = await Paciente.findOneAndUpdate(
            { _id: pacienteId, activo: { $ne: false } },
            { telefono, direccion, obraSocial: { ...obraSocial, nombre: obra.nombre } },
            { new: true, runValidators: true },
        ).select(CAMPOS_PERFIL);
        if (!paciente) return respuestaEstandar(res, 404, false, 'Paciente no encontrado');

        return respuestaEstandar(res, 200, true, 'Datos actualizados correctamente', paciente);
    } catch (error: unknown) {
        if (error instanceof MongooseError.ValidationError) {
            const errores = Object.values(error.errors).map((err) => err.message);
            return respuestaEstandar(res, 400, false, 'Error de validación', errores);
        }
        return respuestaEstandar(res, 500, false, 'Error del servidor', mensajeDeError(error));
    }
};

// Cambia la contraseña de su cuenta, pidiendo la actual
const cambiarMiPassword = async (req: Request<unknown, unknown, ICambiarPasswordPacienteDTO>, res: Response) => {
    try {
        const usuario = await Usuario.findById(req.usuario?.id);
        if (!usuario) return respuestaEstandar(res, 404, false, 'Cuenta no encontrada');

        const { passwordActual, passwordNueva } = req.body;
        if (!(await bcrypt.compare(passwordActual, usuario.password))) {
            return respuestaEstandar(res, 400, false, 'La contraseña actual no es correcta');
        }

        usuario.password = await bcrypt.hash(passwordNueva, 10);
        await usuario.save();

        return respuestaEstandar(res, 200, true, 'Contraseña actualizada correctamente');
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error del servidor', mensajeDeError(error));
    }
};

export { getMiPerfil, actualizarMiPerfil, cambiarMiPassword };