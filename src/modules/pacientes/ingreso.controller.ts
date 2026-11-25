import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { Rol } from '../auth/Usuario.model';
import { buscarOCrearPorDniIngreso } from './paciente.service';
import { ingresoSchema } from './dtos/Paciente.schema';

export const ingresoRapido = async (req: Request, res: Response) => {
  try {
    const { nombre, apellido, dni, telefono } = ingresoSchema.parse(req.body);

    const paciente = await buscarOCrearPorDniIngreso(dni, nombre, apellido, telefono);
    // Un paciente desactivado no puede entrar por ingreso rápido
    if (paciente.activo === false) {
      return res.status(403).json({ message: 'No pudimos continuar. Acercate a la salita y te ayudamos.' });
    }
    const pacienteId = String(paciente._id);

    const token = jwt.sign(
      // ingreso: 'rapido' marca que no entró con usuario y contraseña:
      // el servidor le niega "mis turnos" y cancelar (middleware soloConCuenta)
      { id: pacienteId, user: paciente.dni, rol: Rol.PACIENTE, activo: true, pacienteId, ingreso: 'rapido' },
      process.env.JWT_SECRET!,
      { expiresIn: '30m' },
    );

    res.json({ token });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message ?? 'Datos inválidos' });
    }
    console.error(error);
    res.status(500).json({ message: 'No pudimos procesar el ingreso' });
  }
};