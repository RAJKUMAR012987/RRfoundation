import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import 'dotenv/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { ErrorRequestHandler } from 'express';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

type ServerRealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>['realtime']
>['transport'];
const serverRealtimeTransport = WebSocket as unknown as ServerRealtimeTransport;

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const allowedDonationCategories = new Set(['education', 'health', 'women', 'hunger']);

interface RazorpayPayment {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  method?: unknown;
  email?: unknown;
  created_at?: unknown;
  notes?: { category?: unknown };
}

function getRazorpayConfig(): { keyId: string; keySecret: string } | null {
  const keyId = process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function getSupabaseAdminClient() {
  const url = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: serverRealtimeTransport },
  });
}

function hasSupabaseAdminConfig(): boolean {
  return Boolean(process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function saveVerifiedPayment(payment: RazorpayPayment): Promise<void> {
  if (
    typeof payment.id !== 'string' ||
    typeof payment.amount !== 'number' ||
    typeof payment.currency !== 'string' ||
    payment.status !== 'captured'
  ) {
    throw new Error('Razorpay payment data is incomplete or not captured.');
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error('Server-side Supabase credentials are not configured.');

  const createdAt =
    typeof payment.created_at === 'number' ? new Date(payment.created_at * 1000) : new Date();
  const notes = isRecord(payment.notes) ? payment.notes : {};
  const { error } = await supabase.from('donation_payments').upsert(
    {
      payment_id: payment.id,
      order_id: typeof payment.order_id === 'string' ? payment.order_id : null,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: typeof payment.method === 'string' ? payment.method : null,
      donor_email: typeof payment.email === 'string' ? payment.email : null,
      category:
        typeof notes['category'] === 'string' &&
        allowedDonationCategories.has(notes['category'])
          ? notes['category']
          : null,
      paid_at: createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'payment_id' },
  );
  if (error) throw error;
}

app.post('/api/payments/order', express.json({ limit: '10kb' }), async (req, res) => {
  const body: unknown = req.body;
  const request = isRecord(body) ? body : {};
  const amount = request['amount'];
  const category = request['category'];

  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 10 ||
    amount > 100_000 ||
    typeof category !== 'string' ||
    !allowedDonationCategories.has(category)
  ) {
    res.status(400).json({ error: 'Enter a valid donation amount and cause.' });
    return;
  }

  const config = getRazorpayConfig();
  if (!config) {
    res.status(503).json({
      error: 'Payment processing is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server .env file, then restart the server.',
    });
    return;
  }
  if (!hasSupabaseAdminConfig()) {
    res.status(503).json({
      error: 'Payment recording is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server .env file before accepting donations.',
    });
    return;
  }

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amount * 100,
      currency: 'INR',
      receipt: `rrngo_${randomUUID().replaceAll('-', '')}`,
      notes: { category },
    }),
  });

  if (!response.ok) {
    res.status(502).json({ error: 'Razorpay could not create the payment order.' });
    return;
  }

  const order: unknown = await response.json();
  if (!isRecord(order) || typeof order['id'] !== 'string') {
    res.status(502).json({ error: 'Razorpay returned an invalid payment order.' });
    return;
  }
  res.json({ orderId: order['id'], keyId: config.keyId });
});

app.post('/api/payments/verify', express.json({ limit: '10kb' }), async (req, res) => {
  const body: unknown = req.body;
  const request = isRecord(body) ? body : {};
  const orderId = request['orderId'];
  const paymentId = request['paymentId'];
  const signature = request['signature'];
  const config = getRazorpayConfig();

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    res.status(400).json({ error: 'Payment verification details are invalid.' });
    return;
  }
  if (!config) {
    res.status(503).json({ error: 'Payment verification is not configured on the server.' });
    return;
  }
  if (!hasSupabaseAdminConfig()) {
    res.status(503).json({
      error: 'Payment was not recorded. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server .env file, then restart the server. Check Razorpay before retrying; payment may have been captured.',
    });
    return;
  }

  const expected = createHmac('sha256', config.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(400).json({ error: 'Payment signature verification failed.' });
    return;
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`,
      },
    },
  );
  if (!response.ok) {
    res.status(502).json({ error: 'Razorpay payment status could not be verified.' });
    return;
  }

  const payment: unknown = await response.json();
  if (
    !isRecord(payment) ||
    payment['order_id'] !== orderId ||
    payment['status'] !== 'captured'
  ) {
    res.status(409).json({ error: 'Razorpay has not confirmed this payment as captured.' });
    return;
  }

  await saveVerifiedPayment(payment as RazorpayPayment);
  res.json({ verified: true });
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'];
  const signature = req.get('x-razorpay-signature');
  if (!webhookSecret) {
    res.status(503).json({ error: 'Payment webhook is not configured on the server.' });
    return;
  }
  if (!Buffer.isBuffer(req.body) || !signature || !/^[a-f\d]{64}$/i.test(signature)) {
    res.status(400).json({ error: 'Invalid webhook request.' });
    return;
  }

  const expected = createHmac('sha256', webhookSecret).update(req.body).digest();
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(400).json({ error: 'Webhook signature verification failed.' });
    return;
  }

  const payload: unknown = JSON.parse(req.body.toString('utf8'));
  if (!isRecord(payload) || typeof payload['event'] !== 'string') {
    res.status(400).json({ error: 'Invalid webhook payload.' });
    return;
  }
  if (payload['event'] !== 'payment.captured') {
    res.status(200).json({ received: true });
    return;
  }

  const paymentPayload = payload['payload'];
  const paymentRecord =
    isRecord(paymentPayload) && isRecord(paymentPayload['payment'])
      ? paymentPayload['payment']
      : null;
  const payment = paymentRecord && isRecord(paymentRecord['entity'])
    ? paymentRecord['entity'] as RazorpayPayment
    : null;
  if (!payment) {
    res.status(400).json({ error: 'Captured payment details are missing.' });
    return;
  }

  await saveVerifiedPayment(payment);
  res.status(200).json({ received: true });
});

const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Payment API request failed.', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: 'The payment request could not be completed. Please try again.' });
};
app.use('/api', apiErrorHandler);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
