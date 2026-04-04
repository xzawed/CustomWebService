import { initWebhookForwarder } from '@/lib/events/webhookForwarder';

// Initialize webhook forwarder on first import
// This is a side-effect import — the forwarder registers itself with eventBus
initWebhookForwarder();
