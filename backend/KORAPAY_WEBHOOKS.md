Testing Korapay webhooks via Cloudflare Tunnel

1. Ensure .env has correct values:

KORAPAY_WEBHOOK_SECRET="<your_korapay_webhook_secret>"
KORAPAY_WEBHOOK_URL="https://<your-tunnel>.trycloudflare.com/api/webhooks/korapay"

2. Start Cloudflare Tunnel to forward to your local backend port (e.g. 3000):

# Example using cloudflared
cloudflared tunnel --url http://localhost:3000

3. Verify webhook endpoint is reachable from the public URL:

curl -I https://<your-tunnel>.trycloudflare.com/api/webhooks/korapay

4. To simulate a Korapay webhook, send a POST containing a `data` object and a valid HMAC signature (sha256 hex of JSON.stringify(data) using KORAPAY_WEBHOOK_SECRET):

# Example (bash)
DATA='{"reference":"KPY-PAY-ABC123","status":"success","amount":10}'
SIG=$(echo -n "$DATA" | openssl dgst -sha256 -hmac "${KORAPAY_WEBHOOK_SECRET}" | sed 's/^.*= //')

curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-korapay-signature: $SIG" \
  -d "{\"event\": \"charge.success\", \"data\": $DATA}" \
  https://<your-tunnel>.trycloudflare.com/api/webhooks/korapay

5. Check backend logs for receipt and processing.

Notes:
- The server acknowledges webhook receipts immediately (HTTP 200) and processes updates asynchronously.
- If you change the webhook path, update `KORAPAY_WEBHOOK_URL` accordingly.
