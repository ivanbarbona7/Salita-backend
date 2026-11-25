// Ingreso rápido pide el celular en un solo campo (10 números: código de área + número), pero el resto del sistema
// guarda el código de área aparte. Acá se separan.
//
// El código de área argentino tiene 2, 3 o 4 números y el número local completa los 10 (8, 7 o 6).
// Sin una tabla completa de códigos no se puede saber con certeza, así que se usa esta regla:
//   - empieza con 11 (Buenos Aires)        -> 2 números
//   - empieza con un código de 3 de ciudad grande (lista de abajo) -> 3 números
//   - cualquier otro (ej. 3777 Goya)       -> 4 números
// Si alguna vez se separa mal, recepción lo corrige desde Editar paciente.
const CODIGOS_DE_3 = new Set([
    '221', '223', '261', '264', '280', '291', '294', '299', '341', '342', '343', '351', '358',
    '362', '370', '376', '379', '381', '383', '387', '388',
]);

export const separarTelefono = (diezNumeros: string): { codigoArea: string; numero: string } => {
    if (diezNumeros.startsWith('11')) return { codigoArea: '11', numero: diezNumeros.slice(2) };
    const tres = diezNumeros.slice(0, 3);
    if (CODIGOS_DE_3.has(tres)) return { codigoArea: tres, numero: diezNumeros.slice(3) };
    return { codigoArea: diezNumeros.slice(0, 4), numero: diezNumeros.slice(4) };
};