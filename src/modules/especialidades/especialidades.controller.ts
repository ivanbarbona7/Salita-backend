import type { Request, Response } from 'express';
import Especialidad from './Especialidad.model';
import { respuestaEstandar } from '../../utils/respuestaEstandar';

import type { IQueryEspecialidades, ICrearEspecialidadDTO} from './dtos/especialidad.schema';

const getEspecialidades = async (req: Request<unknown, unknown, unknown, IQueryEspecialidades>, res: Response) => {
    try {
        // ?nombre=CARDIOLOGIA
        const { nombre } = req.query;
        const filtro: Record<string, any> = { activo: true };

        if (nombre) {
            filtro.nombre = nombre.toUpperCase();
        }

        const especialidades = await Especialidad.find(filtro);

        return respuestaEstandar(res, 200, true, 'Especialidades obtenidas exitosamente', especialidades);

    } catch (error: any) {
        return respuestaEstandar(res, 500, false, 'Error al obtener las especialidades', error.message);
    }
};

const getEspecialidadById = async (req: Request<{ id: string}>, res: Response) => {
    try {
        const { id } = req.params;

        const especialidad = await Especialidad.findOne({ _id: id, activo: true });

        if (!especialidad) {
            return respuestaEstandar(res, 404, false, 'Especialidad no encontrada');
        }

        return respuestaEstandar(res, 200, true, 'Especialidad obtenida exitosamente', especialidad);

    } catch (error: any) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', error.message);
    }
};

const createEspecialidad = async (req: Request<unknown, unknown, ICrearEspecialidadDTO>, res: Response) => {
    try {
        const nuevaEspecialidad = await Especialidad.create(req.body);

        return respuestaEstandar(res, 201, true, 'Especialidad creada exitosamente', nuevaEspecialidad);

    } catch (error: any) {
        return respuestaEstandar(res, 500, false, 'Error al crear la especialidad', error.message);
    }
};

const updateEspecialidad = async (req: Request<{ id: string }, unknown, ICrearEspecialidadDTO>, res: Response) => {
    try {
        const { id } = req.params;

        const especialidadActualizada = await Especialidad.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });

        if (!especialidadActualizada) {
            return respuestaEstandar(res, 404, false, 'Especialidad no encontrada');
        }

        return respuestaEstandar(res, 200, true, 'Especialidad actualizada exitosamente', especialidadActualizada);

    } catch (error: any) {

        if (error.name === 'ValidationError') {
            const errores = Object.values(error.errors).map((err:any) => err.message);

            return respuestaEstandar(res, 400, false, 'Error de validación', errores);
        }

        return respuestaEstandar(res, 400, false, 'Error al actualizar la especialidad', error.message);
    }
};

const desactivarEspecialidad = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const especialidad = await Especialidad.findById(req.params.id);
        if (!especialidad) {
            return respuestaEstandar(res, 404, false, 'Especialidad no encontrado');
        }
        especialidad.activo = false;
        await especialidad.save();
        return respuestaEstandar(res, 200, true, 'Especialidad desactivado correctamente', especialidad);
    } catch (error: any) {
        return respuestaEstandar(res, 500, false, 'Error al desactivar el especialidad', error.message);
    }
};

const deleteEspecialidad = async (req: Request<{ id: string }, unknown, unknown>, res: Response) => {
    try {
        const { id } = req.params;

        const especialidadBorrada = await Especialidad.findByIdAndUpdate(id, { activo: false }, { new: true });

        if (!especialidadBorrada) {
            return respuestaEstandar(res, 404, false, 'Especialidad no encontrada');
        }

        return respuestaEstandar(res, 200, true, 'Especialidad eliminada exitosamente', especialidadBorrada);

    } catch (error: any) {
        return respuestaEstandar(res, 400, false, 'ID con formato inválido', error.message);
    }
};
    
export {
    getEspecialidades,
    getEspecialidadById,
    createEspecialidad,
    updateEspecialidad,
    desactivarEspecialidad,
    deleteEspecialidad
};