import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function sendPasswordResetEmail({ email, name, token }) {
  if (!config.email.resendApiKey) throw new AppError(503, 'Password reset email is not configured. Set RESEND_API_KEY and EMAIL_FROM.', 'EMAIL_NOT_CONFIGURED');
  const resetUrl = new URL('/', config.email.frontendUrl);
  resetUrl.searchParams.set('resetToken', token);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [email], subject: 'Reset your RecipeBox password', text: `Hello ${name},\n\nA Security Administrator requested a password reset. Choose a new password using this one-time link, valid for 30 minutes:\n\n${resetUrl}\n\nIf you did not expect this email, contact RecipeBox support.`, html: `<p>Hello ${escapeHtml(name)},</p><p>A Security Administrator requested a password reset. Choose a new password using this one-time link, valid for 30 minutes:</p><p><a href="${escapeHtml(resetUrl.toString())}">Reset password</a></p><p>If you did not expect this email, contact RecipeBox support.</p>` }),
  });
  if (!response.ok) {
    console.error('Password reset email provider error:', response.status, (await response.text()).slice(0, 300));
    throw new AppError(502, 'Could not send the password reset email. Please try again.', 'EMAIL_DELIVERY_FAILED');
  }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
