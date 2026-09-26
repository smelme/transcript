/**
 * The fee, taken before the review.
 *
 * The applicant pays Quals for the work of having the record checked, which is the arrangement a
 * transcript order has always had with an agent. Money moves before a person looks, so the rules
 * that matter here are about believing the wrong thing:
 *
 * **A payment is confirmed against the provider, not against the page that returns to us.** The
 * return page carries a session id, and that id is looked up; the applicant's browser never gets to
 * say that money moved. The same lookup runs when the provider's own notification arrives, so the
 * two cannot disagree.
 *
 * **The amount is checked, not assumed.** A session that was paid for a different amount, in a
 * different currency, or against a different request, is refused, because a request priced at $30
 * that a $1 session could mark paid would be a hole rather than a shortcut.
 *
 * Refunds are not automated yet. A declined request records that the fee is owed back and tells the
 * applicant so, which is honest; promising an automatic return the system cannot make would not be.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export class PaymentService {
  /**
   * @param {object} options
   * @param {string} [options.secretKey] the provider's secret key
   * @param {string} [options.publishableKey] the key the wallet-side page would need, if any
   * @param {(input: string, init?: object) => Promise<object>} [options.fetchImpl] for the tests
   */
  constructor({
    secretKey = process.env.STRIPE_SECRET_KEY || null,
    publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null,
    fetchImpl = null,
  } = {}) {
    this.secretKey = secretKey;
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl || ((url, init) => fetch(url, init));
  }

  get configured() {
    return Boolean(this.secretKey);
  }

  /**
   * A hosted checkout for one request.
   *
   * The request id travels as the session's client reference *and* in its metadata: the first is
   * what the provider gives back on the session, and the second survives into the provider's own
   * dashboard, where somebody reconciling by hand will look for it.
   */
  async createCheckout({ requestId, amount, currency, productName, description = null, successUrl, cancelUrl }) {
    if (!this.configured) {throw new Error('Payment is not configured');}
    if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
      throw new Error('A positive amount in minor units is required');
    }

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('client_reference_id', String(requestId));
    form.set('metadata[request_id]', String(requestId));
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', String(currency).toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(Number(amount)));
    form.set(
      'line_items[0][price_data][product_data][name]',
      productName || 'Credential request',
    );
    if (description) {
      form.set('line_items[0][price_data][product_data][description]', String(description).slice(0, 500));
    }

    const data = await this._call('/checkout/sessions', form);
    if (!data.id || !data.url) {throw new Error('The payment provider returned no checkout to send the applicant to');}

    return {
      sessionId: data.id,
      url: data.url,
      amount: Number(data.amount_total ?? amount),
      currency: String(data.currency || currency).toLowerCase(),
    };
  }

  /** Look a session up. This is where a payment is confirmed from. */
  async getSession(sessionId) {
    if (!this.configured) {throw new Error('Payment is not configured');}
    const data = await this._call(`/checkout/sessions/${encodeURIComponent(sessionId)}`, null, 'GET');
    return {
      sessionId: data.id,
      amount: Number(data.amount_total || 0),
      currency: String(data.currency || '').toLowerCase(),
      paymentStatus: data.payment_status || 'unpaid',
      status: data.status || null,
      clientReferenceId: data.client_reference_id || null,
      requestId: data.metadata?.request_id || null,
    };
  }

  /**
   * Whether a session settles a given request's fee. Every refusal here is a reason somebody will
   * have to act on, so each one says which of the things did not match.
   *
   * A session that names no request is refused rather than allowed: this provider lets a session be
   * created without a reference, and an unreferenced one settles nothing here.
   */
  verify({ session, requestId, amount, currency }) {
    const reference = session.requestId || session.clientReferenceId || null;
    if (!reference) {return { paid: false, reason: 'This payment is not linked to a request' };}
    if (reference !== requestId) {return { paid: false, reason: 'This payment is for another request' };}
    if (session.paymentStatus !== 'paid') {return { paid: false, reason: 'This payment has not completed' };}
    if (Number(session.amount) !== Number(amount)) {
      return { paid: false, reason: 'This payment is not for the fee on this request' };
    }
    if (String(session.currency || '').toLowerCase() !== String(currency).toLowerCase()) {
      return { paid: false, reason: 'This payment is in another currency' };
    }
    return { paid: true, reason: null };
  }

  async _call(path, form = null, method = 'POST') {
    const response = await this.fetchImpl(`${STRIPE_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      ...(form ? { body: form.toString() } : {}),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      // The provider's own message is the useful one, so it is passed through rather than replaced.
      const message = data?.error?.message || `The payment provider refused that (${response.status})`;
      throw new Error(message);
    }
    return data;
  }
}

export default PaymentService;
