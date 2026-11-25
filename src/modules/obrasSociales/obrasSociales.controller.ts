import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import ObraSocial from './ObraSocial.model';
import Paciente from '../pacientes/Paciente.model';
import { Rol } from '../auth/Usuario.model';
import { asegurarNinguna } from './obrasSociales.service';
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import type { CrearObraSocialDTO, QueryObrasSocialesDTO } from './dtos/obraSocial.schema';

const mensajeDeError = (error: unknown) => (error instanceof Error ? error.message : 'Error interno del servidor');

const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const MENSAJE_DUPLICADA = 'Ya existe una obra social con ese nombre';
const MENSAJE_SISTEMA = '"NINGUNA" es la opción por defecto del sistema y no se puede modificar';

// Cuántos pacientes tiene cada obra social
const pacientesPorObraSocial = async () => {
    const filas = await Paciente.aggregate<{ _id: string; n: number }>([
        { $group: { _id: '$obraSocial.nombre', n: { $sum: 1 } } },
    ]);
    return new Map(filas.map((f) => [f._id, f.n]));
};

// GET /obras-sociales?activas=true
// El paciente (y los selectores de los formularios) solo reciben las activas; el personal ve todas, con su uso.
export const getObrasSociales = async (req: Request<unknown, unknown, unknown, QueryObrasSocialesDTO>, res: Response) => {
    try {
        await asegurarNinguna();
        const esPaciente = req.usuario?.rol === Rol.PACIENTE;
        const soloActivas = esPaciente || req.query.activas === 'true';

        const items = await ObraSocial.find(soloActivas ? { activo: true } : {})
            .collation({ locale: 'es', strength: 2 })
            .sort({ esSistema: -1, nombre: 1 }) // "NINGUNA" primero
            .lean();

        const uso = esPaciente ? null : await pacientesPorObraSocial();
        const datos = items.map((o) => ({
            id: String(o._id),
            nombre: o.nombre,
            activo: o.activo,
            esSistema: o.esSistema,
            ...(uso ? { enUso: uso.get(o.nombre) ?? 0 } : {}),
        }));
        return respuestaEstandar(res, 200, true, 'Obras sociales obtenidas', datos);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// POST /obras-sociales
export const crearObraSocial = async (req: Request<unknown, unknown, CrearObraSocialDTO>, res: Response) => {
    try {
        const creada = await ObraSocial.create({ nombre: req.body.nombre });
        return respuestaEstandar(res, 201, true, 'Obra social cargada', { id: String(creada._id), nombre: creada.nombre });
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, MENSAJE_DUPLICADA);
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// PUT /obras-sociales/:id  { nombre }   Corrige el nombre y lo actualiza en todos los pacientes que la tienen.
export const renombrarObraSocial = async (req: Request<{ id: string }, unknown, CrearObraSocialDTO>, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return respuestaEstandar(res, 400, false, 'ID inválido');

        const actual = await ObraSocial.findById(id);
        if (!actual) return respuestaEstandar(res, 404, false, 'Obra social no encontrada');
        if (actual.esSistema) return respuestaEstandar(res, 409, false, MENSAJE_SISTEMA);

        const viejo = actual.nombre;
        if (viejo === req.body.nombre) return respuestaEstandar(res, 200, true, 'Sin cambios', { id, nombre: viejo });

        actual.nombre = req.body.nombre;
        await actual.save();
        const { modifiedCount } = await Paciente.updateMany(
            { 'obraSocial.nombre': viejo },
            { $set: { 'obraSocial.nombre': actual.nombre } },
        );
        return respuestaEstandar(res, 200, true, `Nombre actualizado (${modifiedCount} pacientes)`, { id, nombre: actual.nombre });
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, MENSAJE_DUPLICADA);
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

const cambiarEstado = (activo: boolean) => async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return respuestaEstandar(res, 400, false, 'ID inválido');

        // Atómico: no toca la del sistema ni una que ya esté en ese estado
        const cambiada = await ObraSocial.findOneAndUpdate(
            { _id: id, esSistema: false, activo: !activo },
            { activo },
        );
        if (cambiada) {
            return respuestaEstandar(res, 200, true, activo ? 'Obra social reactivada' : 'Obra social desactivada');
        }

        const existente = await ObraSocial.findById(id).select('esSistema activo');
        if (!existente) return respuestaEstandar(res, 404, false, 'Obra social no encontrada');
        if (existente.esSistema) return respuestaEstandar(res, 409, false, MENSAJE_SISTEMA);
        return respuestaEstandar(res, 409, false, activo ? 'Ya estaba activa' : 'Ya estaba desactivada');
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

export const desactivarObraSocial = cambiarEstado(false);
export const reactivarObraSocial = cambiarEstado(true);

// DELETE /obras-sociales/:id   Solo si ningún paciente la usa (para corregir una carga equivocada)
export const eliminarObraSocial = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return respuestaEstandar(res, 400, false, 'ID inválido');

        const obra = await ObraSocial.findById(id);
        if (!obra) return respuestaEstandar(res, 404, false, 'Obra social no encontrada');
        if (obra.esSistema) return respuestaEstandar(res, 409, false, MENSAJE_SISTEMA);

        const enUso = await Paciente.countDocuments({ 'obraSocial.nombre': obra.nombre });
        if (enUso > 0) {
            return respuestaEstandar(
                res, 409, false,
                `No se puede eliminar: ${enUso} paciente(s) la tienen. Podés desactivarla para que no se ofrezca más.`,
            );
        }

        await obra.deleteOne();
        return respuestaEstandar(res, 200, true, 'Obra social eliminada');
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};