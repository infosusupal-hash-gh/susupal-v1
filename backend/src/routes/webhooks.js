const express = require("express");
const router = express.Router();

const prisma = require("../prisma/client");
const korapay = require("../services/korapay");
const ledger = require("../services/ledger");
const sms = require("../services/sms");
const { processChargeSuccess } = require("../services/paymentSuccess");
const { storeWebhookPayment } = require("../services/webhookPayments");
const logger = require("../utils/logger");

function parseReference(data) {
  return (
    data?.reference ||
    data?.merchant_reference ||
    data?.transaction_reference ||
    data?.payment_reference ||
    null
  );
}

/**
 * POST /webhooks/korapay
 * Handle Korapay payment/transfer callbacks.
 *
 * Korapay sends webhooks for transaction status updates.
 * We re-verify the transaction against Korapay's status API before acting on it.
 * Body shape: { event, data: { reference, status, amount, customer, ... } }
 */
router.post("/korapay", async (req, res) => {
  try {
    console.log("🔥 KORAPAY WEBHOOK RECEIVED");

    console.log("Headers:");
    console.log(req.headers);

    console.log("Body:");
    console.log(JSON.stringify(req.body, null, 2));

    // Reply immediately to Korapay
    res.status(200).json({
      success: true,
      message: "Webhook received",
    });
    // Verify signature and parse body (supports raw body)
    const verification = korapay.verifyWebhookRequest(req);
    if (!verification.valid) {
      logger.warn("Korapay webhook signature invalid", {
        error: verification.error,
      });
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = verification.body;
    const data = event.data || {};

    const reference = parseReference(data);
    const eventType = event.event || event.type;
    const status = String(data.status || "").toLowerCase();
    const isSuccessful = eventType === "charge.success" && status === "success";
    const isFailed =
      eventType === "charge.failed" ||
      status === "failed" ||
      status === "failure";

    logger.info("Korapay webhook received", {
      event: eventType,
      reference,
      status,
    });

    // Process in next tick to avoid blocking the response
    setImmediate(async () => {
      try {
        if (!reference) {
          logger.warn("Korapay webhook missing reference");
          return;
        }

        const grossAmount = Number(data.amount ?? data.total_amount ?? null);
        const amountPaid = Number(data.amount_paid ?? data.amount ?? data.total_amount ?? null);
        const fee = Number(data.fee ?? data.processing_fee ?? data.transaction_fee ?? null);
        const netAmount = Number(
          data.net_amount ??
            (Number.isFinite(amountPaid) && Number.isFinite(fee) ? amountPaid - fee : null)
        );

        await storeWebhookPayment({
          korapayRef: reference,
          amount: grossAmount || amountPaid || null,
          amountPaid: Number.isFinite(amountPaid) ? amountPaid : null,
          fee: Number.isFinite(fee) ? fee : null,
          netAmount: Number.isFinite(netAmount) ? netAmount : null,
          currency: data.currency || data.currency_code || "GHS",
          status: data.status || eventType || "pending",
          paymentMethod: data.payment_method || data.channel || data.paymentMethod || null,
          eventType: eventType || null,
          payload: event,
        });

        // Idempotency: already finalised as SUCCESS -> stop.
        const existingTx = await prisma.transaction.findFirst({
          where: {
            status: "SUCCESS",
            OR: [
              {
                reference: reference,
              },
              {
                korapay_ref: reference,
              },
            ],
          },
        });
        if (existingTx) {
          logger.info("Korapay webhook: transaction already marked SUCCESS", {
            reference,
          });
          return;
        }

        const transaction = await prisma.transaction.findFirst({
          where: {
            OR: [
              {
                reference: reference,
              },
              {
                korapay_ref: reference,
              },
            ],
          },
        });
        if (!transaction) {
          logger.warn("No transaction found for webhook reference", {
            reference,
          });
          return;
        }

        if (isSuccessful) {
          if (transaction.type === "PAYOUT") {
            await handleTransferSuccess(
              transaction,
              data.payment_reference || data.reference || reference
            );
          } else {
            await handleChargeSuccess(
              transaction,
              data.payment_reference || data.reference || reference
            );
          }
        } else if (isFailed) {
          if (transaction.type === "PAYOUT") {
            await handleTransferFailed(transaction);
          } else {
            await handleChargeFailed(transaction);
          }
        } else {
          logger.info(
            "Korapay webhook ignored as it was not a supported success or failure event",
            { reference, eventType, status }
          );
        }
      } catch (err) {
        logger.error("Error processing Korapay webhook async", {
          error: err.message,
        });
      }
    });
  } catch (error) {
    logger.error("Webhook processing error", { error: error.message });
    // Return 200 to prevent retries on our processing errors.
    if (!res.headersSent) {
      res.status(500).json({
        error: "Webhook processing failed",
      });
    }
  }
});

async function handleChargeSuccess(transaction, korapayRef) {
  // Delegates to the shared payment-success service so webhook and
  // manual admin reconciliation execute identical success logic.
  await processChargeSuccess(transaction, korapayRef, { source: "webhook" });
}

async function handleChargeFailed(transaction) {
  const { reference, amount } = transaction;

  await ledger.updateTransactionStatus(reference, "FAILED");

  const user = await prisma.user.findUnique({
    where: { id: transaction.user_id },
  });
  await prisma.user.update({
    where: { id: transaction.user_id },
    data: { failed_debits: { increment: 1 } },
  });

  await sms.sendPaymentFailed(user.phone, amount);

  const updatedUser = await prisma.user.findUnique({
    where: { id: transaction.user_id },
  });
  const maxFailures = parseInt(process.env.MAX_FAILURES || "5");

  if (updatedUser.failed_debits >= maxFailures) {
    await prisma.user.update({
      where: { id: user.id },
      data: { is_active: false },
    });
    if (transaction.plan_id) {
      await prisma.savingsPlan.update({
        where: { id: transaction.plan_id },
        data: { status: "PAUSED" },
      });
    }
    await sms.sendAccountSuspended(user.phone);
  }

  logger.info("Contribution failed recorded", {
    reference,
    userId: transaction.user_id,
  });
}

async function handleTransferSuccess(transaction, korapayRef) {
  const { reference } = transaction;
  await ledger.updateTransactionStatus(reference, "SUCCESS", korapayRef);
  logger.info("Payout transfer successful", { reference });
}

async function handleTransferFailed(transaction) {
  const { reference } = transaction;
  await ledger.updateTransactionStatus(reference, "FAILED");
  logger.error("Payout transfer failed", { reference });
}

module.exports = router;
