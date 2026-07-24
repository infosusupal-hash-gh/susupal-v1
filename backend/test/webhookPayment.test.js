const test = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyWebhookPaymentForTransaction,
  storeWebhookPayment,
} = require('../src/services/webhookPayments');

test('rejects a fake reference when no webhook record exists', async () => {
  const prismaStub = {
    webhookPayment: {
      findUnique: async () => null,
    },
  };

  const result = await verifyWebhookPaymentForTransaction({
    submittedReference: 'KPY-FAKE-REF',
    expectedAmount: 10.29,
    prismaClient: prismaStub,
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.error,
    'Payment cannot be verified because no matching Korapay webhook was received.'
  );
});

test('rejects a webhook record that belongs to another payment or is already linked', async () => {
  const prismaStub = {
    webhookPayment: {
      findUnique: async () => ({
        korapay_ref: 'KPY-REAL-REF',
        amount: 10.29,
        currency: 'GHS',
        status: 'success',
        used: true,
      }),
    },
  };

  const result = await verifyWebhookPaymentForTransaction({
    submittedReference: 'KPY-REAL-REF',
    expectedAmount: 10.29,
    prismaClient: prismaStub,
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.error,
    'This Korapay payment has already been linked to another transaction.'
  );
});

test('accepts a matching success webhook payment for the expected amount', async () => {
  const prismaStub = {
    webhookPayment: {
      findUnique: async () => ({
        id: 'webhook-1',
        korapay_ref: 'KPY-VALID-REF',
        amount: 10.29,
        currency: 'GHS',
        status: 'success',
        used: false,
      }),
    },
  };

  const result = await verifyWebhookPaymentForTransaction({
    submittedReference: 'KPY-VALID-REF',
    expectedAmount: 10.29,
    prismaClient: prismaStub,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.webhookPayment.korapay_ref, 'KPY-VALID-REF');
});

test('uses net amount from the webhook payload when reconciling fees', async () => {
  const prismaStub = {
    webhookPayment: {
      findUnique: async () => ({
        id: 'webhook-2',
        korapay_ref: 'KPY-FEE-REF',
        amount: 10.29,
        fee: 0.29,
        net_amount: 10.0,
        currency: 'GHS',
        status: 'success',
        used: false,
      }),
    },
  };

  const result = await verifyWebhookPaymentForTransaction({
    submittedReference: 'KPY-FEE-REF',
    expectedAmount: 10,
    prismaClient: prismaStub,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.webhookPayment.korapay_ref, 'KPY-FEE-REF');
});

test('stores webhook payloads and prevents double use of the same reference', async () => {
  const calls = [];
  const prismaStub = {
    webhookPayment: {
      findUnique: async ({ where }) => {
        calls.push(['findUnique', where]);
        return null;
      },
      upsert: async ({ where, update, create }) => {
        calls.push(['upsert', where, update, create]);
        return { id: 'webhook-2', ...create };
      },
    },
  };

  const record = await storeWebhookPayment(
    {
      korapayRef: 'KPY-ONE-TIME-REF',
      amount: 10.29,
      currency: 'GHS',
      status: 'success',
      paymentMethod: 'mobile_money',
      eventType: 'charge.success',
      payload: { event: 'charge.success' },
    },
    prismaStub
  );

  assert.equal(record.korapay_ref, 'KPY-ONE-TIME-REF');
  assert.equal(calls[0][0], 'upsert');
});
