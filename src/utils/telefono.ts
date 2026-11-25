
interface ITelefono {
  codigoArea?: string;
  numero?: string;
}

export const telefonoParaWhatsApp = (t: ITelefono) => {
  const area = (t.codigoArea ?? '').replace(/\D/g, '').replace(/^0/, '');
  const numero = (t.numero ?? '').replace(/\D/g, '').replace(/^15/, '');
  return `549${area}${numero}`;
};