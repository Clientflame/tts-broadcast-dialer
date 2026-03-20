/**
 * Unified Notification Dispatcher
 * 
 * Routes notifications to all enabled channels:
 * 1. Manus (built-in) — via notifyOwner()
 * 2. Email — via SMTP (using existing nodemailer setup)
 * 3. SMS — via Twilio API
 * 
 * Channel configuration is stored in app_settings:
 * - notification_email_enabled: "1" or "0"
 * - notification_email_recipients: comma-separated email addresses
 * - notification_sms_enabled: "1" or "0"
 * - notification_sms_recipients: comma-separated phone numbers (E.164 format)
 * - twilio_account_sid: Twilio Account SID
 * - twilio_auth_token: Twilio Auth Token
 * - twilio_from_number: Twilio phone number to send from (E.164 format)
 */

import { notifyOwner, type NotificationPayload } from "../_core/notification";
import { sendNotificationEmail, getSmtpConfig } from "./email";
import * as db from "../db";

// ─── App Settings Keys ──────────────────────────────────────────────────────

export const CHANNEL_SETTINGS_KEYS = {
  emailEnabled: "notification_email_enabled",
  emailRecipients: "notification_email_recipients",
  smsEnabled: "notification_sms_enabled",
  smsRecipients: "notification_sms_recipients",
  twilioAccountSid: "twilio_account_sid",
  twilioAuthToken: "twilio_auth_token",
  twilioFromNumber: "twilio_from_number",
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationChannelConfig {
  email: {
    enabled: boolean;
    recipients: string[];
    smtpConfigured: boolean;
  };
  sms: {
    enabled: boolean;
    recipients: string[];
    twilioConfigured: boolean;
    fromNumber: string;
  };
  manus: {
    enabled: boolean; // always true if forge API is configured
  };
}

export interface DispatchResult {
  manus: { sent: boolean; error?: string };
  email: { sent: boolean; recipients: string[]; error?: string };
  sms: { sent: boolean; recipients: string[]; error?: string };
}

// ─── Channel Config Helpers ─────────────────────────────────────────────────

export async function getNotificationChannelConfig(): Promise<NotificationChannelConfig> {
  const emailEnabled = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.emailEnabled);
  const emailRecipientsRaw = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.emailRecipients);
  const smsEnabled = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.smsEnabled);
  const smsRecipientsRaw = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.smsRecipients);
  const twilioSid = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioAccountSid);
  const twilioToken = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioAuthToken);
  const twilioFrom = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioFromNumber);

  const smtpConfig = await getSmtpConfig();

  const emailRecipients = emailRecipientsRaw
    ? emailRecipientsRaw.split(",").map(e => e.trim()).filter(Boolean)
    : [];

  const smsRecipients = smsRecipientsRaw
    ? smsRecipientsRaw.split(",").map(p => p.trim()).filter(Boolean)
    : [];

  return {
    email: {
      enabled: emailEnabled === "1",
      recipients: emailRecipients,
      smtpConfigured: !!smtpConfig,
    },
    sms: {
      enabled: smsEnabled === "1",
      recipients: smsRecipients,
      twilioConfigured: !!(twilioSid && twilioToken && twilioFrom),
      fromNumber: twilioFrom || "",
    },
    manus: {
      enabled: true,
    },
  };
}

// ─── Email Channel ──────────────────────────────────────────────────────────

function buildAlertEmailHtml(title: string, content: string): string {
  const appName = process.env.VITE_APP_TITLE || "TTS Broadcast Dialer";
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "long" });
  
  // Determine severity color from title
  let headerColor = "#18181b"; // default dark
  let badgeColor = "#3b82f6"; // blue
  let badgeLabel = "INFO";
  if (title.toLowerCase().includes("offline") || title.toLowerCase().includes("failed") || title.toLowerCase().includes("disabled")) {
    headerColor = "#dc2626";
    badgeColor = "#dc2626";
    badgeLabel = "ALERT";
  } else if (title.toLowerCase().includes("online") || title.toLowerCase().includes("completed") || title.toLowerCase().includes("success")) {
    headerColor = "#16a34a";
    badgeColor = "#16a34a";
    badgeLabel = "RESOLVED";
  } else if (title.toLowerCase().includes("flagged") || title.toLowerCase().includes("throttle")) {
    headerColor = "#ea580c";
    badgeColor = "#ea580c";
    badgeLabel = "WARNING";
  }

  // Convert newlines to HTML
  const htmlContent = content.replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${headerColor};padding:20px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${appName}</h1></td>
            <td align="right"><span style="display:inline-block;padding:4px 12px;background-color:rgba(255,255,255,0.2);color:#ffffff;border-radius:12px;font-size:11px;font-weight:600;letter-spacing:0.5px;">${badgeLabel}</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="margin:0 0 12px;color:#18181b;font-size:16px;font-weight:600;">${title}</h2>
          <div style="margin:0 0 20px;color:#52525b;font-size:14px;line-height:1.7;">${htmlContent}</div>
          <div style="padding:12px 16px;background-color:#f4f4f5;border-radius:8px;border-left:3px solid ${badgeColor};">
            <p style="margin:0;color:#71717a;font-size:12px;">Timestamp: ${timestamp}</p>
          </div>
        </td></tr>
        <tr><td style="background-color:#fafafa;padding:14px 32px;text-align:center;border-top:1px solid #e4e4e7;">
          <p style="margin:0;color:#a1a1aa;font-size:11px;">&copy; ${new Date().getFullYear()} ${appName} &mdash; System Alert Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmailNotification(title: string, content: string, recipients: string[]): Promise<{ sent: boolean; error?: string }> {
  if (recipients.length === 0) {
    return { sent: false, error: "No email recipients configured" };
  }

  const appName = process.env.VITE_APP_TITLE || "TTS Broadcast Dialer";
  const subject = `[${appName}] ${title}`;
  const htmlBody = buildAlertEmailHtml(title, content);
  const textBody = `${title}\n\n${content}\n\n---\nTimestamp: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}\n${appName} System Alert`;

  const results: boolean[] = [];
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      const sent = await sendNotificationEmail(recipient, subject, htmlBody, textBody);
      results.push(sent);
      if (!sent) errors.push(`Failed to send to ${recipient}`);
    } catch (err: any) {
      results.push(false);
      errors.push(`${recipient}: ${err.message}`);
    }
  }

  const anySent = results.some(Boolean);
  return {
    sent: anySent,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ─── SMS Channel (Twilio) ───────────────────────────────────────────────────

async function getTwilioConfig() {
  const accountSid = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioAccountSid);
  const authToken = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioAuthToken);
  const fromNumber = await db.getAppSetting(CHANNEL_SETTINGS_KEYS.twilioFromNumber);

  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

async function sendSmsNotification(title: string, content: string, recipients: string[]): Promise<{ sent: boolean; error?: string }> {
  if (recipients.length === 0) {
    return { sent: false, error: "No SMS recipients configured" };
  }

  const config = await getTwilioConfig();
  if (!config) {
    return { sent: false, error: "Twilio not configured" };
  }

  // Truncate SMS to 1600 chars (Twilio limit for long SMS)
  const appName = process.env.VITE_APP_TITLE || "TTS Broadcast Dialer";
  const smsBody = `[${appName}] ${title}\n\n${content}`.substring(0, 1600);

  const results: boolean[] = [];
  const errors: string[] = [];

  try {
    const twilio = await import("twilio");
    const client = twilio.default(config.accountSid, config.authToken);

    for (const recipient of recipients) {
      try {
        await client.messages.create({
          body: smsBody,
          from: config.fromNumber,
          to: recipient,
        });
        results.push(true);
      } catch (err: any) {
        results.push(false);
        errors.push(`${recipient}: ${err.message}`);
        console.warn(`[SMS] Failed to send to ${recipient}:`, err.message);
      }
    }
  } catch (err: any) {
    return { sent: false, error: `Twilio init error: ${err.message}` };
  }

  const anySent = results.some(Boolean);
  return {
    sent: anySent,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ─── Test Channel Connections ───────────────────────────────────────────────

export async function testEmailChannel(testRecipient?: string): Promise<{ success: boolean; error?: string }> {
  const config = await getNotificationChannelConfig();
  if (!config.email.smtpConfigured) {
    return { success: false, error: "SMTP is not configured. Set up SMTP in Settings first." };
  }

  const recipients = testRecipient ? [testRecipient] : config.email.recipients;
  if (recipients.length === 0) {
    return { success: false, error: "No email recipients configured." };
  }

  const result = await sendEmailNotification(
    "Test Notification",
    "This is a test notification from your TTS Broadcast Dialer system.\n\nIf you received this email, your notification channel is working correctly.",
    [recipients[0]] // only send to first recipient for test
  );

  return { success: result.sent, error: result.error };
}

export async function testSmsChannel(testRecipient?: string): Promise<{ success: boolean; error?: string }> {
  const config = await getNotificationChannelConfig();
  if (!config.sms.twilioConfigured) {
    return { success: false, error: "Twilio is not configured. Set up Twilio credentials first." };
  }

  const recipients = testRecipient ? [testRecipient] : config.sms.recipients;
  if (recipients.length === 0) {
    return { success: false, error: "No SMS recipients configured." };
  }

  const result = await sendSmsNotification(
    "Test Notification",
    "This is a test SMS from your TTS Broadcast Dialer system. If you received this, your SMS notification channel is working correctly.",
    [recipients[0]] // only send to first recipient for test
  );

  return { success: result.sent, error: result.error };
}

// ─── Unified Dispatcher ─────────────────────────────────────────────────────

/**
 * Dispatch a notification to all enabled channels.
 * 
 * This replaces direct notifyOwner() calls. It:
 * 1. Always sends to Manus (built-in)
 * 2. Sends email if email channel is enabled and configured
 * 3. Sends SMS if SMS channel is enabled and configured
 * 
 * Returns a result object showing which channels were used.
 */
export async function dispatchNotification(payload: NotificationPayload): Promise<DispatchResult> {
  const config = await getNotificationChannelConfig();

  const result: DispatchResult = {
    manus: { sent: false },
    email: { sent: false, recipients: [] },
    sms: { sent: false, recipients: [] },
  };

  // 1. Always try Manus built-in notification
  try {
    const manusSent = await notifyOwner(payload);
    result.manus = { sent: manusSent };
  } catch (err: any) {
    result.manus = { sent: false, error: err.message };
    console.warn("[Dispatcher] Manus notification failed:", err.message);
  }

  // 2. Email channel
  if (config.email.enabled && config.email.smtpConfigured && config.email.recipients.length > 0) {
    try {
      const emailResult = await sendEmailNotification(payload.title, payload.content, config.email.recipients);
      result.email = { ...emailResult, recipients: config.email.recipients };
    } catch (err: any) {
      result.email = { sent: false, recipients: config.email.recipients, error: err.message };
      console.warn("[Dispatcher] Email notification failed:", err.message);
    }
  }

  // 3. SMS channel
  if (config.sms.enabled && config.sms.twilioConfigured && config.sms.recipients.length > 0) {
    try {
      const smsResult = await sendSmsNotification(payload.title, payload.content, config.sms.recipients);
      result.sms = { ...smsResult, recipients: config.sms.recipients };
    } catch (err: any) {
      result.sms = { sent: false, recipients: config.sms.recipients, error: err.message };
      console.warn("[Dispatcher] SMS notification failed:", err.message);
    }
  }

  return result;
}

/**
 * Convenience wrapper: dispatch only if a specific notification preference is enabled.
 * This is the main function to use in place of the old notifyOwner() pattern.
 */
export async function dispatchIfEnabled(notificationKey: string, payload: NotificationPayload): Promise<DispatchResult | null> {
  const enabled = await db.isNotificationEnabled(notificationKey);
  if (!enabled) return null;
  return dispatchNotification(payload);
}
