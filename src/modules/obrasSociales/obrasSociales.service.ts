import ObraSocial from './ObraSocial.model';

export const OBRA_SOCIAL_POR_DEFECTO = 'NINGUNA';

// Crea "NINGUNA" si todavía no existe (es la que traen los pacientes por defecto)
export const asegurarNinguna = () =>
    ObraSocial.updateOne(
        { nombre: OBRA_SOCIAL_POR_DEFECTO },
        { $setOnInsert: { nombre: OBRA_SOCIAL_POR_DEFECTO, activo: true, esSistema: true } },
        { upsert: true },
    );

export type ResultadoObraSocial = { error: string } | { nombre: string };

// Una obra social solo se puede asignar a un paciente si está cargada en el catálogo y activa.
// Excepción: si el paciente ya la tiene (`actual`), puede conservarla aunque después la hayan desactivado.
export const validarObraSocial = async (nombre: string, actual?: string | null): Promise<ResultadoObraSocial> => {
    const limpio = nombre.trim().toUpperCase();

    if (limpio === OBRA_SOCIAL_POR_DEFECTO) {
        await asegurarNinguna();
        return { nombre: limpio };
    }

    const encontrada = await ObraSocial.findOne({ nombre: limpio }).select('nombre activo');
    if (!encontrada) {
        return { error: `La obra social "${limpio}" no está cargada. Elegí una de la lista o pedí que la agreguen en Configuración.` };
    }
    if (!encontrada.activo && limpio !== (actual ?? '').toUpperCase()) {
        return { error: `La obra social "${limpio}" está desactivada. Elegí otra de la lista.` };
    }
    return { nombre: encontrada.nombre };
};