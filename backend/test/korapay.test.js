const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChargePayload, buildDisbursementPayload } = require('../src/services/korapay');

test('buildChargePayload uses KoraPay mobile-money fields', () => {
  const payload = buildChargePayload({
    reference: 'REF-123',
    amount: 701,
    phone: '0240000000',
    narration: 'Payment for a emilokan',
    name: 'John Doe',
    email: 'john@email.com',
  });

  assert.equal(payload.amount, 701);
  assert.equal(payload.currency, 'GHS');
  assert.equal(payload.reference, 'REF-123');
  assert.equal(payload.description, 'Payment for a emilokan');
  assert.equal(payload.merchant_bears_cost, true);
  assert.equal(payload.mobile_money.number, '233240000000');
  assert.equal(payload.customer.name, 'John Doe');
  assert.equal(payload.customer.email, 'john@email.com');
});

test('buildDisbursementPayload uses KoraPay disbursement shape', () => {
  const payload = buildDisbursementPayload({
    reference: 'PAY-001',
    amount: '100',
    phone: '256700000000',
    narration: 'Test Transfer Payment 008',
    name: 'John Doe',
    email: 'johndoe@email.com',
  });

  assert.equal(payload.reference, 'PAY-001');
  assert.equal(payload.destination.amount, '100');
  assert.equal(payload.destination.currency, 'GHS');
  assert.equal(payload.destination.mobile_money.mobile_number, '233256700000000');
  assert.equal(payload.destination.customer.name, 'John Doe');
});

test('buildDisbursementPayload normalizes Ghana mobile numbers for payouts', () => {
  const payload = buildDisbursementPayload({
    reference: 'PAY-002',
    amount: '50',
    phone: '0240000000',
    narration: 'Small payout',
    name: 'Jane Doe',
    email: 'jane@email.com',
  });

  assert.equal(payload.destination.mobile_money.mobile_number, '233240000000');
});
