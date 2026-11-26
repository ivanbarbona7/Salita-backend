import Paciente from './Paciente.model.js';
import { TipoTelefono } from './types/PacienteTelefono.enum.js';
import { separarTelefono } from '../../utils/telefonoAR.js';

export const buscarPorDni = (dni: string) => Paciente.findOne({ dni });

export const buscarOCrearPorDni = async (dni: string, nombre: string, apellido: string, telefono: string) =>
  (await buscarPorDni(dni)) ??
  Paciente.create({ dni, nombre, apellido, telefono: { tipo: TipoTelefono.CELULAR, ...separarTelefono(telefono) } });

// Ingreso rápido: si el DNI ya existe NO se pisan sus datos (nombre, apellido, teléfono) con lo que escriba
// la persona, porque cualquiera podría escribir el DNI de otro. Solo se completa el apellido si faltaba
// (pacientes creados antes de que este formulario lo pidiera).
export const buscarOCrearPorDniIngreso = async (dni: string, nombre: string, apellido: string, telefono: string) => {
  const existente = await buscarPorDni(dni);
  if (existente) {
    if (!existente.apellido) {
      existente.apellido = apellido;
      await existente.save();
    }
    return existente;
  }
  return Paciente.create({
    dni,
    nombre,
    apellido,
    origen: 'INGRESO_RAPIDO',
    // Antes se guardaba todo junto en "numero" y el código de área quedaba vacío (se veía "undefined 3777500032")
    telefono: { tipo: TipoTelefono.CELULAR, ...separarTelefono(telefono) },
  });
};