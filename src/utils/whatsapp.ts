export const enviarConfirmacion = async (telefono: string, nombre: string, intentoId: string) => {
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();

  if (!phoneId || !token) {
    throw new Error('Faltan WHATSAPP_PHONE_ID o WHATSAPP_TOKEN en el .env');
  }
  console.log('[WhatsApp] token largo:', token.length, '| empieza con:', token.slice(0, 3), '| phoneId:', phoneId);
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: 'confirmar_ingreso',
        language: { code: 'es_AR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: nombre }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `SI:${intentoId}` }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `NO:${intentoId}` }] },
        ],
      },
    }),
  });

  const cuerpo = await res.text();
  console.log(`[WhatsApp] ${res.status} → ${telefono}: ${cuerpo}`);

  if (!res.ok) {
    throw new Error(`WhatsApp ${res.status}: ${cuerpo}`);
  }
};