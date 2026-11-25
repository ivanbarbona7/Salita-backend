// UNA SOLA VEZ: pasa de la lista fija de obras sociales al catálogo configurable.
//   1) Los pacientes con "OTRAS" pasan a tener el nombre que habían escrito (o NINGUNA si lo dejaron vacío).
//   2) Los pacientes sin obra social quedan con NINGUNA.
//   3) Se crea el catálogo: NINGUNA (del sistema), las obras sociales que ya había y las que usan los pacientes.
// Uso (desde la carpeta del backend, con la base configurada en el .env):
//   npx tsx --env-file=.env src/scripts/migrarObrasSociales.ts
import mongoose from 'mongoose';
import Paciente from '../modules/pacientes/Paciente.model';
import ObraSocial from '../modules/obrasSociales/ObraSocial.model';

await mongoose.connect(process.env.MONGO_URI ?? process.env.MONGODB_URI ?? '');

const BASE = ['PAMI', 'IOSCOR', 'OSPEL', 'OSDE', 'SANCOR', 'OSECAC', 'SWISS MEDICAL', 'GALENO', 'MEDICUS', 'OMINT', 'FEMEBA'];
const coleccion = Paciente.collection;

// 1) OTRAS -> el nombre escrito a mano
const otras = await coleccion.find({ 'obraSocial.nombre': 'OTRAS' }).toArray();
for (const p of otras) {
    const escrito = String((p.obraSocial as { otra?: string } | undefined)?.otra ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    await coleccion.updateOne({ _id: p._id }, { $set: { 'obraSocial.nombre': escrito || 'NINGUNA' } });
}
console.log(`OTRAS convertidas: ${otras.length}`);

// El campo "otra" ya no existe
await coleccion.updateMany({ 'obraSocial.otra': { $exists: true } }, { $unset: { 'obraSocial.otra': '' } });

// 2) Sin obra social -> NINGUNA
const sin = await coleccion.updateMany(
    { $or: [{ 'obraSocial.nombre': { $exists: false } }, { 'obraSocial.nombre': null }, { 'obraSocial.nombre': '' }] },
    { $set: { 'obraSocial.nombre': 'NINGUNA' } },
);
console.log(`Pacientes sin obra social -> NINGUNA: ${sin.modifiedCount}`);

// 3) Catálogo
await ObraSocial.updateOne(
    { nombre: 'NINGUNA' },
    { $setOnInsert: { nombre: 'NINGUNA', activo: true, esSistema: true } },
    { upsert: true },
);
const usadas = (await coleccion.distinct('obraSocial.nombre')) as string[];
for (const nombre of new Set([...BASE, ...usadas])) {
    if (!nombre || nombre === 'NINGUNA') continue;
    await ObraSocial.updateOne({ nombre }, { $setOnInsert: { nombre, activo: true, esSistema: false } }, { upsert: true });
}

console.log(`Catálogo listo: ${await ObraSocial.countDocuments()} obras sociales`);
await mongoose.disconnect();