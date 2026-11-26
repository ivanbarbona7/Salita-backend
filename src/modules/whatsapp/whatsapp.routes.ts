import { Router } from 'express';
import { recibirWebhook, verificarWebhook } from './whatsapp.controller.js';

const router = Router();
router.get('/', verificarWebhook);
router.post('/', recibirWebhook);
export default router;