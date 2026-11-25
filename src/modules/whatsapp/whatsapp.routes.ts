import { Router } from 'express';
import { recibirWebhook, verificarWebhook } from './whatsapp.controller';

const router = Router();
router.get('/', verificarWebhook);
router.post('/', recibirWebhook);
export default router;