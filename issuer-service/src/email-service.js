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

export async function sendEmail({ to, subject, html }) {
  const config = getBrevoConfig();
  if (!(config.apiKey && config.fromEmail)) {
    return { success: false, reason: 'Brevo not configured' };
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
 * Send a one-time code email for wallet account invitation or sign-in.
 * @returns {{ success: boolean, messageId?: string|null, reason?: string, error?: string }}
 */
export async function sendOtpEmail({ email, otp, purpose }) {
  const isInvite = purpose === 'invite';
  const subject = isInvite ? 'Your wallet verification code' : 'Your wallet sign-in code';
  const action = isInvite ? 'verify your email address' : 'sign in to your wallet';

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
  <p>Use the code below to ${action}:</p>
  <p class="code">${otp}</p>
  <p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
</body>
</html>`;

  return sendEmail({ to: email, subject, html });
}

export default { isEmailConfigured, sendEmail, sendOtpEmail };
