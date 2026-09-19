/**
 * Email delivery for the issuer service (Brevo transactional API).
 *
 * Uses the same provider as Smart College (Brevo / Sendinblue). Configure via:
 *   BREVO_API_KEY, FROM_EMAIL, FROM_NAME, BREVO_API_URL (optional).
 *
 * When email is not configured, `sendEmail` returns { success: false, reason }
 * so callers can fall back (e.g. return the OTP in the response during dev).
 */

function getBrevoConfig() {
  return {
    apiKey: process.env.BREVO_API_KEY,
    apiUrl: process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email',
    fromEmail: process.env.FROM_EMAIL || 'noreply@smartcollege.edu',
    fromName: process.env.FROM_NAME || 'Smart College',
  };
}

export function isEmailConfigured() {
  const { apiKey, fromEmail } = getBrevoConfig();
  return !!(apiKey && fromEmail);
}

/**
 * Whether one-time codes may be returned in API responses as a development
 * fallback when email delivery is unavailable.
 *
 * This is OFF in production: a mail outage must never silently downgrade into
 * handing the code back to the caller. Override explicitly with ALLOW_DEV_OTP.
 */
export function devOtpAllowed() {
  if (process.env.ALLOW_DEV_OTP === 'true') {return true;}
  if (process.env.ALLOW_DEV_OTP === 'false') {return false;}
  return process.env.NODE_ENV !== 'production';
}

export async function sendEmail({ to, subject, html }) {
  const config = getBrevoConfig();
  if (!(config.apiKey && config.fromEmail)) {
      // Local development has no provider, so nothing actually leaves the machine. Say so, with
      // the link the message was carrying: otherwise a share, or a sign-in code, looks broken when
      // it is only unsent.
      const link = String(html || '').match(/https?:\/\/[^\s"'<>]+/)?.[0];
      console.log(`[email] not sent, no provider configured${link ? `: ${link}` : ''}`);
  }

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': config.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: config.fromName, email: config.fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Brevo API ${response.status}: ${text}`);
    }

    const data = await response.json();
    return { success: true, messageId: data.messageId || null };
  } catch (error) {
    console.error('[email] Brevo send failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send the wallet email for a wallet-account invitation or sign-in.
 *
 * For an invitation (`purpose === 'invite'`) this is a proper "you've been
 * invited to download credentials" email that names the issuing authority and
 * explains the steps (install the wallet, sign in with the invited email, then
 * continue on the site to transfer the credential). The one-time code is still
 * included as a fallback in development.
 *
 * @returns {{ success: boolean, messageId?: string|null, reason?: string, error?: string }}
 */
export async function sendOtpEmail({ email, otp, purpose, institution, siteUrl, audience }) {
  const isInvite = purpose === 'invite';
  const institute = institution || 'Your institution';

  if (isInvite) {
    const subject = `${institute} has sent you an invitation to download credentials`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #14161c; color: #fff; padding: 24px 28px; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { background: #fff; border: 1px solid #e5e5e5; border-top: none; padding: 24px 28px; border-radius: 0 0 12px 12px; }
    .step { margin: 14px 0; padding-left: 0; }
    .step b { color: #0a58ca; }
    .code { font-size: 22px; font-weight: 700; letter-spacing: 4px; color: #0a58ca; }
    .muted { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${institute} has sent you an invitation</h1>
  </div>
  <div class="body">
    <p>Hello,</p>
    <p><strong>${institute}</strong> has invited you to download your verified credentials into the Quals wallet.</p>
    <p>To get started:</p>
    <div class="step"><b>1.</b> Download the wallet app first, if you haven't done so already.</div>
    <div class="step"><b>2.</b> Sign in using the email address this invitation was sent to (${email}).</div>
    <div class="step"><b>3.</b> You will then be able to continue on the ${institute} site to transfer your credential to your wallet.</div>
    ${siteUrl ? `
    <p style="margin: 22px 0;">
      <a href="${siteUrl}" style="display:inline-block;background:#14161c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;">Continue on the ${institute} site</a>
    </p>
    <p class="muted">Or visit ${siteUrl}</p>` : ''}
    <p class="muted">If you did not request this invitation, you can safely ignore this email.</p>
  </div>
</body>
</html>`;
    return sendEmail({ to: email, subject, html });
  }

  // A sign-in code goes to one of two audiences and they are not the same thing: the academy site
  // signs a student in to their record, the wallet signs them in to their credentials. The wording
  // says which one this code is for, so a code that arrives while someone is on the academy site
  // is not read as a wallet code, and the two are never treated as interchangeable.
  const forAcademy = audience === 'academy';
  const subject = forAcademy ? `Your ${institute} sign-in code` : 'Your wallet sign-in code';
  const intro = forAcademy
    ? `Use the code below to sign in to ${institute}:`
    : 'Use the code below to sign in to your wallet:';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; }
    .code { font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #0a58ca; }
  </style>
</head>
<body>
  <p>${intro}</p>
  <p class="code">${otp}</p>
  <p>This code expires in 10 minutes. ${forAcademy
    ? `It signs you in to ${institute} only. Your wallet has its own separate code.`
    : 'If you did not request this, you can safely ignore this email.'}</p>
</body>
</html>`;
  return sendEmail({ to: email, subject, html });
}

/**
 * "Your credentials are ready" email for the academy self-service flow. It
 * links the recipient straight to the issuance page, where they sign in with
 * this email address and add the credential to their wallet.
 *
 * @returns {{ success: boolean, messageId?: string|null, reason?: string, error?: string }}
 */
export async function sendCredentialsReadyEmail({ email, institution, claimUrl, credentials = [] }) {
  const institute = institution || 'Your institution';
  const list = credentials.length
    ? `<ul style="margin:10px 0 0;padding-left:20px">${credentials
      .map((c) => `<li><strong>${c.title || 'Credential'}</strong>${c.subtitle ? ` — ${c.subtitle}` : ''}</li>`)
      .join('')}</ul>`
    : '';
  const subject = `Your ${institute} credentials are ready to add to your wallet`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #14161c; color: #fff; padding: 24px 28px; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { background: #fff; border: 1px solid #e5e5e5; border-top: none; padding: 24px 28px; border-radius: 0 0 12px 12px; }
    .btn { display:inline-block;background:#14161c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600; }
    .muted { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your credentials are ready</h1>
  </div>
  <div class="body">
    <p>Hello,</p>
    <p><strong>${institute}</strong> has prepared your digital credentials. You can now add them to your Quals wallet.</p>
    ${list}
    <p style="margin: 22px 0;">
      <a class="btn" href="${claimUrl}">Add to wallet</a>
    </p>
    <p class="muted">Sign in with <strong>${email}</strong>. The same address this email was sent to.</p>
    <p class="muted">Or copy this link into your browser:<br>${claimUrl}</p>
    <p class="muted">If you did not request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;
  return sendEmail({ to: email, subject, html });
}

export default { isEmailConfigured, devOtpAllowed, sendEmail, sendOtpEmail, sendCredentialsReadyEmail };
