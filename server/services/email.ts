import nodemailer from "nodemailer";
import * as db from "../db";

// SMTP config keys stored in app_settings
const SMTP_KEYS = {
  host: "smtp_host",
  port: "smtp_port",
  secure: "smtp_secure",
  user: "smtp_user",
  pass: "smtp_pass",
  fromEmail: "smtp_from_email",
  fromName: "smtp_from_name",
} as const;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Load SMTP configuration from app_settings table with env var fallback.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const host = await db.getAppSetting(SMTP_KEYS.host) || process.env.SMTP_HOST;
  const port = await db.getAppSetting(SMTP_KEYS.port) || process.env.SMTP_PORT || "587";
  const secure = await db.getAppSetting(SMTP_KEYS.secure) || process.env.SMTP_SECURE || "false";
  const user = await db.getAppSetting(SMTP_KEYS.user) || process.env.SMTP_USER;
  const pass = await db.getAppSetting(SMTP_KEYS.pass) || process.env.SMTP_PASS;
  const fromEmail = await db.getAppSetting(SMTP_KEYS.fromEmail) || process.env.SMTP_FROM_EMAIL;
  const fromName = await db.getAppSetting(SMTP_KEYS.fromName) || process.env.SMTP_FROM_NAME || "TTS Broadcast Dialer";

  if (!host || !user || !pass || !fromEmail) {
    return null;
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: secure === "true",
    user,
    pass,
    fromEmail,
    fromName,
  };
}

/**
 * Create a nodemailer transporter from current SMTP config.
 */
async function createTransporter() {
  const config = await getSmtpConfig();
  if (!config) {
    throw new Error("SMTP not configured. Please configure SMTP settings in the admin Settings page.");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

/**
 * Test SMTP connection with current settings.
 */
export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Connection failed" };
  }
}

/**
 * Send a password reset email with a link containing the reset token.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  origin: string
): Promise<boolean> {
  try {
    const config = await getSmtpConfig();
    if (!config) {
      console.warn("[Email] SMTP not configured — cannot send password reset email");
      return false;
    }

    const transporter = await createTransporter();
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const appName = process.env.VITE_APP_TITLE || "TTS Broadcast Dialer";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${appName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:18px;font-weight:600;">Password Reset Request</h2>
              <p style="margin:0 0 16px;color:#52525b;font-size:14px;line-height:1.6;">
                We received a request to reset the password for your account (<strong>${toEmail}</strong>).
                Click the button below to set a new password.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#71717a;font-size:12px;line-height:1.5;">
                This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
              </p>
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
              <p style="margin:0;color:#a1a1aa;font-size:11px;line-height:1.5;">
                If the button doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${resetUrl}" style="color:#3b82f6;word-break:break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#fafafa;padding:16px 32px;text-align:center;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:11px;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = `Password Reset Request

We received a request to reset the password for your account (${toEmail}).

Click the link below to set a new password:
${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

- ${appName}`;

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toEmail,
      subject: `Password Reset - ${appName}`,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Email] Password reset email sent to ${toEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Failed to send password reset email to ${toEmail}:`, err.message);
    return false;
  }
}

/**
 * Send an email verification link to a newly registered user.
 */
export async function sendVerificationEmail(
  toEmail: string,
  verificationToken: string,
  origin: string
): Promise<boolean> {
  try {
    const config = await getSmtpConfig();
    if (!config) {
      console.warn("[Email] SMTP not configured — cannot send verification email");
      return false;
    }

    const transporter = await createTransporter();
    const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(verificationToken)}`;
    const appName = process.env.VITE_APP_TITLE || "TTS Broadcast Dialer";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${appName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:18px;font-weight:600;">Verify Your Email Address</h2>
              <p style="margin:0 0 16px;color:#52525b;font-size:14px;line-height:1.6;">
                Welcome! Please verify your email address (<strong>${toEmail}</strong>) to activate your account.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#71717a;font-size:12px;line-height:1.5;">
                This link will expire in <strong>24 hours</strong>. If you didn't create this account, you can safely ignore this email.
              </p>
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
              <p style="margin:0;color:#a1a1aa;font-size:11px;line-height:1.5;">
                If the button doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${verifyUrl}" style="color:#3b82f6;word-break:break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafafa;padding:16px 32px;text-align:center;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:11px;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = `Verify Your Email Address\n\nWelcome! Please verify your email address (${toEmail}) to activate your account.\n\nClick the link below to verify:\n${verifyUrl}\n\nThis link will expire in 24 hours. If you didn't create this account, you can safely ignore this email.\n\n- ${appName}`;

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toEmail,
      subject: `Verify Your Email - ${appName}`,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Email] Verification email sent to ${toEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Failed to send verification email to ${toEmail}:`, err.message);
    return false;
  }
}

/**
 * Send a generic notification email (for admin-initiated password resets, etc.)
 */
export async function sendNotificationEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<boolean> {
  try {
    const config = await getSmtpConfig();
    if (!config) {
      console.warn("[Email] SMTP not configured — cannot send notification email");
      return false;
    }

    const transporter = await createTransporter();

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Email] Notification email sent to ${toEmail}: ${subject}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] Failed to send notification email to ${toEmail}:`, err.message);
    return false;
  }
}
