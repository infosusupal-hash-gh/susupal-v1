const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCheckoutUrl, generateContributionReference } = require('../src/services/ledger');

test('buildCheckoutUrl appends checkout reference parameters', () => {
  const reference = 'SUSU-TEST-123';
  const url = buildCheckoutUrl({
    reference,
    userId: 'user-123',
    planId: 'plan-456',
    amount: 10,
  });

  assert.equal(url, 'https://checkout.korapay.com/pay/susupal?reference=SUSU-TEST-123&user_id=user-123&plan_id=plan-456&amount=10');
});

test('generateContributionReference uses a stable prefix and user identifier', () => {
  const reference = generateContributionReference('user-123');
  assert.match(reference, /^SUSU-user-123-/i);
});
