import { test } from 'node:test';
import assert from 'node:assert';

import { PaymentService } from '../src/payment-service.js';

/** The provider, answering with what the test is about and recording what it was asked. */
function stubProvider(handler) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      const { status = 200, body = {} } = handler(url, init) || {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      };
    },
  };
}

function service(handler) {
  const provider = stubProvider(handler);
  return {
    provider,
    service: new PaymentService({ secretKey: 'sk_test_1', fetchImpl: provider.fetchImpl }),
  };
}

test('a checkout is created for the request, in the request\'s own currency and amount', async () => {
  const { provider, service: payments } = service(() => ({
    status: 200,
    body: { id: 'cs_1', url: 'https://checkout.stripe.example/cs_1', amount_total: 3000, currency: 'usd' },
  }));

  const session = await payments.createCheckout({
    requestId: 'request-9',
    amount: 3000,
    currency: 'USD',
    productName: 'Credential request: Smart Academy',
    successUrl: 'https://quals.example/request?paid=1',
    cancelUrl: 'https://quals.example/request?cancelled=1',
  });

  assert.strictEqual(session.sessionId, 'cs_1');
  assert.strictEqual(session.url, 'https://checkout.stripe.example/cs_1');
  assert.strictEqual(session.currency, 'usd', 'the provider wants minor units and a lower-case code');

  const [call] = provider.calls;
  assert.strictEqual(call.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.strictEqual(call.init.headers.authorization, 'Bearer sk_test_1');
  const form = new URLSearchParams(call.init.body);
  assert.strictEqual(form.get('mode'), 'payment');
  assert.strictEqual(form.get('line_items[0][price_data][unit_amount]'), '3000');
  assert.strictEqual(form.get('line_items[0][price_data][currency]'), 'usd');
  // The reference travels twice: on the session, and in the metadata a person reconciling by hand
  // will read in the provider's dashboard.
  assert.strictEqual(form.get('client_reference_id'), 'request-9');
  assert.strictEqual(form.get('metadata[request_id]'), 'request-9');
});

test('a payment is confirmed from the provider, and every mismatch says which one it was', () => {
  const payments = new PaymentService({ secretKey: 'sk_test_1' });
  const fee = { requestId: 'request-9', amount: 3000, currency: 'usd' };
  const base = {
    sessionId: 'cs_1',
    amount: 3000,
    currency: 'usd',
    paymentStatus: 'paid',
    clientReferenceId: 'request-9',
    requestId: 'request-9',
  };

  assert.deepStrictEqual(payments.verify({ session: base, ...fee }), { paid: true, reason: null });

  assert.match(
    payments.verify({ session: { ...base, paymentStatus: 'unpaid' }, ...fee }).reason,
    /has not completed/,
  );
  assert.match(
    payments.verify({ session: { ...base, amount: 100 }, ...fee }).reason,
    /not for the fee/,
  );
  assert.match(
    payments.verify({ session: { ...base, currency: 'eur' }, ...fee }).reason,
    /another currency/,
  );
  assert.match(
    payments.verify({ session: { ...base, clientReferenceId: 'request-8', requestId: 'request-8' }, ...fee }).reason,
    /another request/,
  );
  // A session naming no request at all settles nothing: the fee belongs to a case, not to a payment.
  assert.match(
    payments.verify({ session: { ...base, clientReferenceId: null, requestId: null }, ...fee }).reason,
    /not linked to a request/,
  );
});

test('a paid session for the right fee is the only thing that passes, in either spelling of the amount', () => {
  const payments = new PaymentService({ secretKey: 'sk_test_1' });
  const result = payments.verify({
    session: {
      sessionId: 'cs_1',
      amount: 3000,
      currency: 'usd',
      paymentStatus: 'paid',
      clientReferenceId: 'request-9',
      requestId: null,
    },
    requestId: 'request-9',
    amount: '3000',
    currency: 'USD',
  });
  assert.strictEqual(result.paid, true, 'the currency case must not decide whether a fee is settled');
});

test('without a key, payment is refused rather than quietly free', async () => {
  const payments = new PaymentService({ secretKey: null });
  assert.strictEqual(payments.configured, false);
  await assert.rejects(
    () =>
      payments.createCheckout({
        requestId: 'request-9',
        amount: 3000,
        currency: 'usd',
        successUrl: 'https://x', cancelUrl: 'https://y',
      }),
    /not configured/,
  );
  await assert.rejects(() => payments.getSession('cs_1'), /not configured/);
});

test('a fee of nothing is refused: an unpaid order must not be able to look paid', async () => {
  const { service: payments } = service(() => ({ status: 200, body: { id: 'cs_1', url: 'https://x' } }));
  await assert.rejects(
    () =>
      payments.createCheckout({
        requestId: 'request-9',
        amount: 0,
        currency: 'usd',
        successUrl: 'https://x', cancelUrl: 'https://y',
      }),
    /positive amount/,
  );
});

test('the provider\'s own message is passed through, because it is the useful one', async () => {
  const { service: payments } = service(() => ({
    status: 402,
    body: { error: { message: 'Your card was declined.' } },
  }));
  await assert.rejects(() => payments.getSession('cs_1'), /Your card was declined/);
});
