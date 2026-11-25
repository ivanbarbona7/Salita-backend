import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma';

export const verificarWebhook = (req: Request, res: Response) => {
  const ok = req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN;
  if (ok) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
};

export const recibirWebhook = async (req: Request & { rawBody?: Buffer }, res: Response) => {
  const firma = req.get('x-hub-signature-256') ?? '';
  const esperada =
    'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(req.rawBody ?? Buffer.alloc(0)).digest('hex');

  const valida = firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
  if (!valida) return res.sendStatus(401);

  const payload: string | undefined = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.payload;

if (payload) {
  const [accion, id] = payload.split(':');

  if (id && /^[0-9a-f]{24}$/.test(id) && (accion === 'SI' || accion === 'NO')) {
    await prisma.intentoIngreso.updateMany({
      where: { id, estado: 'PENDIENTE', expiraEn: { gt: new Date() } },
      data: { estado: accion === 'SI' ? 'CONFIRMADO' : 'RECHAZADO' },
    });
  }
}
  res.sendStatus(200);
};