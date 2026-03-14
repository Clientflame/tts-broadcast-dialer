/**
 * IVR Payment Service
 * 
 * Handles payment collection during phone calls via DTMF input.
 * The flow:
 * 1. Caller presses the payment digit (e.g., "1") during IVR
 * 2. PBX agent reports the DTMF + payment intent to the server
 * 3. Server creates a payment record and returns a payment link (SMS) or
 *    processes a pre-authorized payment
 * 
 * For PCI compliance, actual card collection happens via:
 * - Option A: SMS a secure payment link to the caller's phone
 * - Option B: Transfer to a PCI-compliant IVR payment gateway
 * - Option C: Process a pre-authorized payment (stored card on file)
 */

import * as db from "../db";
import { notifyOwner } from "../_core/notification";

export interface PaymentRequest {
  userId: number;
  campaignId: number;
  callLogId: number;
  contactId: number;
  phoneNumber: string;
  amount: number; // in cents
  currency?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentId: number;
  status: string;
  message: string;
  paymentLink?: string;
}

/**
 * Create a payment record for an IVR-initiated payment.
 * This creates a "pending" payment that can be fulfilled via SMS link or direct processing.
 */
export async function createIvrPayment(request: PaymentRequest): Promise<PaymentResult> {
  try {
    const paymentId = await db.createPayment({
      userId: request.userId,
      campaignId: request.campaignId,
      callLogId: request.callLogId,
      contactId: request.contactId,
      phoneNumber: request.phoneNumber,
      amount: request.amount,
      currency: request.currency || "usd",
      status: "pending",
      paymentMethod: "ivr",
      metadata: {
        ...request.metadata,
        initiatedVia: "ivr",
        initiatedAt: Date.now(),
      },
    });

    // Generate a payment link that can be sent via SMS
    // This would integrate with Stripe Payment Links or a custom payment page
    const paymentLink = `${process.env.VITE_APP_URL || ""}/pay/${paymentId}`;

    console.log(`[IVR Payment] Created payment #${paymentId} for $${(request.amount / 100).toFixed(2)} from ${request.phoneNumber}`);

    return {
      success: true,
      paymentId,
      status: "pending",
      message: `Payment of $${(request.amount / 100).toFixed(2)} initiated`,
      paymentLink,
    };
  } catch (err) {
    console.error("[IVR Payment] Failed to create payment:", err);
    return {
      success: false,
      paymentId: 0,
      status: "failed",
      message: (err as Error).message,
    };
  }
}

/**
 * Update a payment status (called after Stripe webhook or manual processing)
 */
export async function updatePaymentStatus(
  paymentId: number,
  status: "processing" | "succeeded" | "failed" | "refunded",
  details?: {
    stripePaymentIntentId?: string;
    stripeCustomerId?: string;
    last4?: string;
    errorMessage?: string;
  }
): Promise<boolean> {
  try {
    await db.updatePayment(paymentId, {
      status,
      ...details,
    });

    if (status === "succeeded") {
      const payment = await db.getPayment(paymentId);
      if (payment) {
        // Notify owner of successful payment
        db.isNotificationEnabled("notify_payment_received").then(enabled => {
          if (enabled) {
            notifyOwner({
              title: `Payment Received: $${(payment.amount / 100).toFixed(2)}`,
              content: `Payment of $${(payment.amount / 100).toFixed(2)} received from ${payment.phoneNumber} via IVR.\n\nCampaign: #${payment.campaignId}\nPayment ID: ${payment.id}`,
            }).catch(err => console.warn("[IVR Payment] Failed to send notification:", err));
          }
        }).catch(() => {});
      }
    }

    return true;
  } catch (err) {
    console.error(`[IVR Payment] Failed to update payment ${paymentId}:`, err);
    return false;
  }
}

/**
 * Get payment statistics for a campaign
 */
export async function getCampaignPaymentStats(campaignId: number): Promise<{
  totalPayments: number;
  totalAmount: number;
  successfulPayments: number;
  successfulAmount: number;
  pendingPayments: number;
  failedPayments: number;
}> {
  return db.getCampaignPaymentStats(campaignId);
}
