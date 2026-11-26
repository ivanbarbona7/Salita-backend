import type { Request, Response, NextFunction } from 'express';
import { respuestaEstandar } from '../utils/respuestaEstandar.js';

export const verificarRol = (...rolesPermitidos: string[]) => {

    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.usuario) {
            return respuestaEstandar(res, 500, false, 'Se intento verificar el rol sin validar el token primero');
        }

        if(!req.usuario.activo) {
            return respuestaEstandar(res, 403, false, 'Usuario inactivo');
        }

        const { rol } = req.usuario;

        if (!rolesPermitidos.includes(rol)) {
            return respuestaEstandar(res, 403, false, 'No tienes permisos para realizar esta accion');
        }

        next();
    };  
}