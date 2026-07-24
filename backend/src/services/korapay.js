const axios = require("axios");
const crypto = require("crypto");
const logger = require("../utils/logger");

const BASE_URL =
  process.env.KORAPAY_BASE_URL || "https://api.korapay.com/merchant/api/v1";

const authToken = process.env.KORAPAY_SECRET_KEY || process.env.KORAPAY_WEBHOOK_SECRET || '';

const korapayClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : undefined,
  },
  timeout: 30000,
});

/**
 * Ghana Network Prefixes
 */
const NETWORK_PREFIXES = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  TELECEL: ["020", "050"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  GLO: ["023"],
};

/**
 * Detect Ghana Mobile Network
 */
function detectNetwork(phone) {
  if (!phone) return "mtn-gh";

  let digits = String(phone).replace(/[\s+-]/g, "");

  if (digits.startsWith("233")) {
    digits = "0" + digits.slice(3);
  }

  if (!digits.startsWith("0")) {
    digits = "0" + digits;
  }

  const prefix = digits.substring(0, 3);

  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) {
      return mapNetworkToKorapay(network);
    }
  }

  return "mtn-gh";
}

/**
 * Map Networks
 */
 function mapNetworkToKorapay(network) {
  switch (String(network).toUpperCase()) {
    case "TELECEL":
    case "VODAFONE":
      return "Vodafone";

    case "AIRTELTIGO":
    case "AIRTEL":
      return "Airtel";

    case "TIGO":
    case "AT":
      return "Tigo";

    case "GLO":
      return "Glo";

    case "MTN":
    case "MOMO":
    case "MTN GH":
      return "Mtn";

    default:
      return "Mtn";
  }
}

/**
 * Format Phone
 */
function toInternationalPhone(phone) {
  let digits = String(phone).replace(/[\s+-]/g, "");

  if (digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  if (!digits.startsWith("233")) {
    digits = "233" + digits;
  }

  return digits;
}

/**
 * Encrypt Korapay Payload
 */
function encryptPayload(data) {
  const keyValue = process.env.KORAPAY_ENCRYPTION_KEY;

  const text = JSON.stringify(data);

  const iv = crypto.randomBytes(16);

  const key = crypto.scryptSync(keyValue, "salt", 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(text, "utf8", "base64");

  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    iv,
    Buffer.from(encrypted, "base64"),
    authTag,
  ]).toString("base64");
}

/**
 * Verify Webhook Signature
 * Uses only the webhook data (req.body.data) for HMAC verification
 * @param {string} dataString - JSON.stringify(req.body.data)
 * @param {string} signature - req.headers["x-korapay-signature"]
 * @returns {boolean}
 */
 function verifyWebhookSignature(dataString, signature) {
  if (!dataString || !signature) {
    logger.warn("Missing data or signature for webhook verification");
    return false;
  }

  const secretKey =
    process.env.KORAPAY_SECRET_KEY ||
    process.env.KORAPAY_WEBHOOK_SECRET ||
    "";

  console.log("SECRET EXISTS:", !!secretKey);

  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataString)
    .digest("hex");

  console.log("EXPECTED:", hash);
  console.log("RECEIVED:", signature);

  const isValid = hash === signature;

  if (!isValid) {
    logger.warn("Webhook signature mismatch", {
      expected: hash.substring(0, 8),
      provided: String(signature).substring(0, 8)
    });
  }

  return isValid;
}

/**
 * Verify webhook request from Korapay
 * Extract signature from headers and verify the request body data
 * @param {object} req - Express request object
 * @returns {object} { valid: boolean, error?: string }
 */
function verifyWebhookRequest(req) {
  try {
    const signature = req.headers['x-korapay-signature'];
    if (!signature) {
      logger.warn('Missing x-korapay-signature header');
      return { valid: false, error: 'Missing signature header' };
    }

    // req.body may be a Buffer when using express.raw for this route. Handle both.
    let bodyString;
    if (Buffer.isBuffer(req.body)) {
      bodyString = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      bodyString = req.body;
    } else {
      // When express.json ran (non-webhook routes), body is already parsed object
      bodyString = JSON.stringify(req.body);
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyString);
    } catch (err) {
      logger.warn('Could not parse webhook body as JSON', { err: err.message });
      return { valid: false, error: 'Invalid JSON body' };
    }

    const data = parsed.data;
    if (!data) {
      logger.warn('Missing data in webhook payload');
      return { valid: false, error: 'Missing data in payload' };
    }

    const dataString = JSON.stringify(data);
    const isValid = verifyWebhookSignature(dataString, signature);
    if (!isValid) {
      logger.warn('Invalid webhook signature', { signature, dataSnippet: dataString.substring(0, 100) });
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, body: parsed };
  } catch (error) {
    logger.error("Webhook verification error", { error: error.message });
    return { valid: false, error: error.message };
  }
}

/**
 * Build Charge Payload
 */
function buildChargePayload({
  reference,
  amount,
  phone,
  network,
  narration,
  name,
  email,
}) {
  return {
    amount: Number(amount),

    currency: "GHS",

    reference,

    description: narration || "Susu daily contribution",

    notification_url: process.env.KORAPAY_WEBHOOK_URL,
    merchant_bears_cost: true,

    customer: {
      name: name || "SusuPal User",

      email: email || `${phone}@susupal.com`,
    },

    mobile_money: {
      number: toInternationalPhone(phone),

      network: network ? mapNetworkToKorapay(network) : detectNetwork(phone),
    },
  };
}

function buildDisbursementPayload({ reference, amount, phone, narration, name, email }) {
  const normalizedPhone = toInternationalPhone(phone);

  return {
    reference,
    destination: {
      amount: String(amount),
      currency: "GHS",
      mobile_money: {
        mobile_number: normalizedPhone,
      },
      customer: {
        name: name || "SusuPal User",
        email: email || `${normalizedPhone}@susupal.com`,
      },
      narration: narration || "Susu payout",
    },
  };
}

/**
 * Charge Customer
 */
async function chargeCustomer(params) {
  try {
    const payload = buildChargePayload(params);

    logger.info("Starting Korapay payment", {
      reference: params.reference,
    });

    const response = await korapayClient.post("/charges/mobile-money", payload);

    return {
      success: true,

      data: response.data.data,

      reference: params.reference,
    };
  } catch (error) {
    logger.error(
      "Korapay payment failed",
      error.response?.data || error.message
    );

    return {
      success: false,

      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Alias
 */
async function chargeMobileMoney(params) {
  return chargeCustomer(params);
}

/**
 * Verify Transaction
 */
async function verifyTransaction(reference) {
  try {
    const response = await korapayClient.get(`/charges/${reference}`);

    return {
      success: true,

      status: response.data.data.status,

      data: response.data.data,
    };
  } catch (error) {
    return {
      success: false,

      error: error.message,
    };
  }
}

async function getBalance() {
  try {
    const response = await korapayClient.get('/balances');
    return {
      success: true,
      data: response.data.data || response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Disbursement
 */
async function disbursePayout({ reference, amount, phone, network, name, narration, email }) {
  try {
    const payload = {
      reference,

      destination: {
        type: "mobile_money",

        amount: String(amount),

        currency: "GHS",

        mobile_money: {
          operator: network
            ? mapNetworkToKorapay(network)
            : detectNetwork(phone),

          mobile_number: toInternationalPhone(phone),
        },

        customer: {
          name: name || "SusuPal User",
          email: email || `${toInternationalPhone(phone)}@susupal.com`,
        },
        narration: narration || "Susu payout",
      },
    };

    const response = await korapayClient.post(
      "/transactions/disburse",
      payload
    );

    const payloadStatus = String(
      response?.data?.data?.status || response?.data?.status || ""
    ).toLowerCase();
    const isSuccessful = payloadStatus === "success" || payloadStatus === "successful";

    return {
      success: isSuccessful,
      data: response.data.data,
      status: payloadStatus || null,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  chargeCustomer,

  chargeMobileMoney,

  verifyTransaction,

  getBalance,

  disbursePayout,

  detectNetwork,

  mapNetworkToKorapay,

  toInternationalPhone,

  encryptPayload,

  verifyWebhookSignature,
  verifyWebhookRequest,

  buildChargePayload,
  buildDisbursementPayload,
};
