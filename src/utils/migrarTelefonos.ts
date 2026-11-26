// UNA SOLA VEZ: separa el código de área de los pacientes que entraron por ingreso rápido con el teléfono junto.
// Uso (desde la carpeta del backend, con la base configurada en el .env):
//   npx tsx --env-file=.env src/scripts/migrarTelefonos.ts
// Solo toca pacientes cuyo código de área está vacío y cuyo número tiene exactamente 10 cifras.
import mongoose from 'mongoose';
import Paciente from '../modules/pacientes/Paciente.model.js';
import { separarTelefono } from '../utils/telefonoAR.js';

await mongoose.connect(process.env.MONGO_URI ?? process.env.MONGODB_URI ?? '');

const candidatos = await Paciente.find({
    'telefono.numero': /^\d{10}$/,
    $or: [{ 'telefono.codigoArea': { $exists: false } }, { 'telefono.codigoArea': '' }],
}).select('nombre apellido telefono');

for (const p of candidatos) {
    const { codigoArea, numero } = separarTelefono(p.telefono.numero);
    await Paciente.updateOne({ _id: p._id }, { 'telefono.codigoArea': codigoArea, 'telefono.numero': numero });
    console.log(`${p.apellido}, ${p.nombre}: ${p.telefono.numero} -> (${codigoArea}) ${numero}`);
}

console.log(`Listo: ${candidatos.length} pacientes actualizados`);
await mongoose.disconnect();