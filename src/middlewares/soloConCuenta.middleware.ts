import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { respuestaEstandar } from '../utils/respuestaEstandar';

// Ver o cancelar turnos muestra datos de salud: no se permite con el ingreso rápido (solo DNI, nombre y teléfono).
// El token del ingreso rápido lleva ingreso: 'rapido'; el del login con usuario y contraseña no.
// Va después de validarJWT.
export const soloConCuenta = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] ?? '';
        const payload = jwt.verify(token, process.env.JWT_SECRET!);

        if (typeof payload === 'object' && payload.ingreso === 'rapido') {
            return respuestaEstandar(
                res, 403, false,
                'Para ver o cancelar tus turnos ingresá con tu usuario y contraseña, o acercate a la salita.',
            );
        }
        return next();
    } catch {
        return respuestaEstandar(res, 401, false, 'No autenticado');
    }
};