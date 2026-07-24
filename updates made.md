Ready for review
Select text to add comments on the plan
Migrate payments from Korapay → korapay
Context
The susu platform (Node/Express + Prisma + BullMQ backend, React frontend) currently processes all money movement through Korapay: daily auto-debit contributions (scheduler.js), manual contribution charges (payments.js), payout disbursements (scheduler.js), transaction status checks, and an inbound webhook (webhooks.js). The goal is to replace Korapay entirely with korapay (https://api.korapay.com) for collections (Initiate Payment) and payouts (Initiate Transfer), keeping the existing ledger/idempotency/SMS/BullMQ architecture intact.

Key API differences that shape the design (from korapay llms-full.txt)
No checkout URL. korapay Initiate Payment (POST /open/transact/payment) sends a USSD/OTP push to the payer's phone; it returns a transactionid, and the real result arrives later via webhook. (Korapay returned a checkout_url to open in a browser.)
Every call needs accountnumber = our korapay wallet account number (new env var).
externalref is korapay's unique-reference field → we map our existing reference to it.
Channel codes differ by operation ⚠️:
Payment (collect): 13=MTN, 6=Telecel, 7=AT
Transfer (payout): 1=MTN, 6=Telecel, 7=AT (MTN differs: 13 vs 1)
Auth headers: payment uses X-API-USER + X-API-PUBKEY (public key, per the user's snippet); transfer/status use X-API-USER + X-API-KEY (private key).
Status check: POST /open/transact/status with {type:1, idtype:1, id:<externalref>, accountnumber} → data.txstatus (1=success, 0=pending, 2=failed).
Response shape: top-level status (1 ok / 0 fail), code (TR099=request sent, TP14=OTP/SMS verification required, TP13=duplicate ref), data, message.
Webhook (POST to our callback): body {status, code, message, data:{...}}, no signature. → Per user decision, we re-verify via the status API and never trust the body blindly.
Files to change
1. New service — backend/src/services/korapay.js (replaces korapay.js)
Create an axios-based korapay client mirroring korapay's exported function names so callers need minimal edits. Export: chargeCustomer, chargeMobileMoney, verifyTransaction, disbursePayout, mapPaymentChannel, mapTransferChannel.

korapayClient config: baseURL = korapay_BASE_URL || 'https://api.korapay.com', JSON, 30s timeout. Headers set per request (payment vs transfer use different keys) rather than on the instance.
Channel mapping helpers translate network string ('MTN'|'VODAFONE'|'TELECEL'|'AIRTELTIGO'|'AT') → correct numeric code for the given operation. Default MTN.
chargeCustomer / chargeMobileMoney → both POST /open/transact/payment with {type:1, channel:<payment code>, currency:'GHS', payer:<phone>, amount:String(amount), externalref:<reference>, reference:<narration>, accountnumber:korapay_ACCOUNT_NUMBER}, headers X-API-USER, X-API-PUBKEY. Interpret response:
status==1 && code=='TR099' → {success:true, transactionId:data, requiresWebhook:true}
status==1 && code=='TP14' → {success:true, needsOtp:true, message} (first-time payer must complete SMS verification; surfaced to caller, not a hard failure)
else → {success:false, error: message||code}
No checkoutUrl in the return (kept undefined for compatibility).
verifyTransaction(reference) → POST /open/transact/status {type:1, idtype:1, id:reference, accountnumber}, headers X-API-USER+X-API-KEY. Map data.txstatus: 1→'success', 0→'pending', 2→'failed'. Return {success, status, korapayRef: data.transactionid, data}.
disbursePayout({reference, amount, phone, network, name}) → POST /open/transact/transfer {type:1, channel:<transfer code>, currency:'GHS', amount:String(amount), receiver:<phone>, externalref:<reference>, reference:<narration>, accountnumber}, headers X-API-USER+X-API-KEY. status==1 (code OBGH01) → success with data.transactionid.
Reuse logger for the same info/error log lines. Drop Korapay's encryptPayload and verifyWebhookSignature (korapay needs neither).
Delete backend/src/services/korapay.js after consumers are switched.
2. backend/src/routes/webhooks.js — rework inbound handler
Rename route POST /korapay → POST /korapay. Require ../services/korapay.
Parse the raw JSON body (no signature step). Extract our reference from data.externalref (fallback data.reference).
Re-verify via status API (user decision): call korapay.verifyTransaction(externalref); branch on the verified status, not the payload:
verified success → existing handleChargeSuccess path (for CONTRIBUTION) or handleTransferSuccess (for PAYOUT) — decide by the transaction's type looked up in DB.
verified failed → handleChargeFailed / handleTransferFailed accordingly.
pending → ack 200, do nothing (await next callback / poll).
Keep the existing idempotency guard (already-SUCCESS → return 200) and the "always return 200 on processing error" behavior. Pass the korapay transactionid into ledger.updateTransactionStatus(reference, 'SUCCESS', korapayRef).
The four handleXxx helpers stay largely as-is (they already key off our reference); only the source of reference/amount changes to korapay's field names.
3. backend/src/index.js — webhook mounting
app.use('/webhooks', express.raw({ type: 'application/json' })) can stay (we JSON.parse the raw buffer). No signature needs the raw body now, but keeping raw is harmless and avoids reordering middleware. (Callback URL registered in korapay dashboard becomes /webhooks/korapay.)
4. backend/src/routes/payments.js — manual charge + verify
Swap require('../services/korapay') → korapay.
POST /charge: call korapay.chargeCustomer(...) (passing network: plan.payout_method). On needsOtp, still create the PENDING ledger entry and return a message telling the user to complete SMS verification. On success, return { message: 'Check your phone and approve the prompt to complete payment.', reference } — no checkout_url.
GET /verify/:reference: use korapay.verifyTransaction; on status==='success' call ledger.updateTransactionStatus(reference,'SUCCESS', verification.korapayRef).
5. backend/src/jobs/scheduler.js — auto-debit + payout
Swap import to korapay. processContributionJob calls korapay.chargeMobileMoney(...) (same args). Treat needsOtp (TP14) as a soft/pending outcome — log it, leave txn PENDING, do not increment failed_debits (it's a verification requirement, not a decline); a real success:false still follows the existing failure/suspension path.
triggerPayout calls korapay.disbursePayout(...) (unchanged args/flow).
6. Prisma field rename (no DB migration) — backend/prisma/schema.prisma
Rename korapay_ref String? → korapay_ref String? @map("korapay_ref"). The @map keeps the existing MySQL column, so no migration / no data change is required — only prisma generate.
Update references: ledger.js (updateTransactionStatus param korapayRef→korapayRef, korapay_ref→korapay_ref), adminTransactions.js (search filter + response field), frontend/src/admin/pages/Transactions.jsx (label 'Korapay Ref'→'korapay Ref', tx.korapay_ref→tx.korapay_ref).
7. Frontend — frontend/src/App.jsx (handleManualPay)
Remove the window.open(res.checkout_url) branch. On success show a message / non-blocking notice: "Check your phone and approve the prompt to complete payment," then call onRefresh() and let the existing history/verify flow reflect the result.
8. Env — backend/.env and backend/.env.example
Replace the # Korapay block with:

# korapay
korapay_BASE_URL="https://api.korapay.com"
korapay_API_USER="your-korapay-username"
korapay_PUBLIC_KEY="your-korapay-public-key"   # collections (Initiate Payment)
korapay_API_KEY="your-korapay-private-key"     # payouts (Transfer) + status
korapay_ACCOUNT_NUMBER="your-korapay-wallet-account-number"
Update README.md payment-provider references from Korapay → korapay.

Notes / decisions
Webhook trust: re-verify via status API (user-confirmed) — callback body treated as a trigger only.
Manual pay UX: show "approve on your phone" message; no browser redirect (user-confirmed).
First-payment OTP (TP14): surfaced gracefully; for auto-debit it leaves the txn PENDING without counting as a failed debit.
Function names in the new service intentionally mirror korapay's to keep call sites small.
Verification
cd backend && npx prisma generate (picks up korapay_ref mapping; confirm no migration prompt).
npm --prefix backend start → server boots, cron/worker start with no missing-module errors.
Manual charge: with sandbox creds (korapay_BASE_URL=https://sandbox.korapay.com), POST /api/payments/charge (auth'd) → expect TR099/PENDING ledger row, response has no checkout_url. Simulate a callback POST /webhooks/korapay with the externalref → handler re-queries status and flips the row to SUCCESS (verify via GET /api/payments/verify/:ref).
Payout: trigger POST /api/payout/run for a completed plan → disbursePayout returns success and the PAYOUT ledger row becomes SUCCESS.
Auto-debit: POST /api/admin/trigger-contributions → jobs enqueue and call the korapay payment endpoint; check logs for TR099/TP14 handling.
Grep to confirm no stray korapay identifiers remain in backend/src and frontend/src.