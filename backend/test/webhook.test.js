const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookRequest } = require('../src/services/korapay');

test('verifyWebhookRequest validates HMAC over req.body.data (raw buffer)', () => {
  const secret = 'test-webhook-secret';
  process.env.KORAPAY_WEBHOOK_SECRET = secret;

  const data = { reference: 'KPY-TEST-123', status: 'success', amount: 10 };
  const body = JSON.stringify({ event: 'charge.success', data });

  const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');

  const req = {
    headers: { 'x-korapay-signature': sig },
    body: Buffer.from(body, 'utf8'),
  };

  const res = verifyWebhookRequest(req);
  assert.equal(res.valid, true, 'Webhook should be valid with correct signature');
});

test('verifyWebhookRequest uses the Korapay secret key for HMAC validation', () => {
  const secret = 'korapay-secret-key';
  delete process.env.KORAPAY_WEBHOOK_SECRET;
  process.env.KORAPAY_SECRET_KEY = secret;

  const data = { reference: 'KPY-TEST-456', status: 'success', amount: 25 };
  const body = JSON.stringify({ event: 'charge.success', data });
  const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');

  const req = {
    headers: { 'x-korapay-signature': sig },
    body: Buffer.from(body, 'utf8'),
  };

  const res = verifyWebhookRequest(req);
  assert.equal(res.valid, true, 'Webhook should be valid when signed with KORAPAY_SECRET_KEY');
});

test('verifyWebhookRequest rejects invalid signature', () => {
  const secret = 'another-secret';
  process.env.KORAPAY_WEBHOOK_SECRET = secret;

  const data = { reference: 'KPY-TEST-999', status: 'failed' };
  const body = JSON.stringify({ event: 'charge.failed', data });

  const badSig = 'deadbeef';
  const req = {
    headers: { 'x-korapay-signature': badSig },
    body: Buffer.from(body, 'utf8'),
  };

  const res = verifyWebhookRequest(req);
  assert.equal(res.valid, false, 'Webhook should be invalid with wrong signature');
});
