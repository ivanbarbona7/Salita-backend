import type { NextFunction, Request, Response } from 'express';
import { respuestaEstandar } from '../utils/respuestaEstandar';

// Rutas "/medicos/yo/...": el médico sale del token, nunca de la URL ni del body.
// Pone su id en req.params.id para reutilizar los mismos controladores que usan admin y recepción.
// Va después de validarJWT y verificarRol(Rol.MEDICO).
export const medicoDelToken = (req: Request, res: Response, next: NextFunction) => {
    const medicoId = req.usuario?.medicoId;
    if (!medicoId) {
        return respuestaEstandar(res, 403, false, 'Tu cuenta no está vinculada a un médico');
    }
    req.params.id = medicoId;
    return next();
};