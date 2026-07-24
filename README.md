# 💰 SusuPal — Digital Susu Savings Platform

A secure, scalable fintech platform replicating Ghana's traditional susu savings model using modern infrastructure.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     SusuPal Platform                    │
├──────────────┬────────────────────┬─────────────────────┤
│  React SPA   │   Express API      │   Background Jobs   │
│  (User + Admin) │   (Node.js)     │   (BullMQ + Cron)   │
├──────────────┴────────────────────┴─────────────────────┤
│           MySQL + Prisma ORM + Redis                    │
├─────────────────────────────────────────────────────────┤
│         Korapay Payments + TextBee SMS                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
susu-platform/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express app entry
│   │   ├── routes/
│   │   │   ├── auth.js           # Register, OTP, login
│   │   │   ├── user.js           # Profile, PIN
│   │   │   ├── savings.js        # Create/manage plans
│   │   │   ├── transactions.js   # Transaction history
│   │   │   ├── payments.js       # Manual charge + OTP handling
│   │   │   ├── payout.js         # Admin payout + admin panel
│   │   │   └── webhooks.js       # Korapay webhooks
│   │   ├── services/
│   │   │   ├── korapay.js         # Payment gateway integration
│   │   │   ├── sms.js            # TextBee SMS service
│   │   │   └── ledger.js         # Ledger accounting logic
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT authentication
│   │   │   └── errorHandler.js   # Global error handling
│   │   ├── jobs/
│   │   │   └── scheduler.js      # Cron + BullMQ workers
│   │   ├── utils/
│   │   │   └── logger.js         # Structured JSON logging
│   │   └── prisma/
│   │       └── client.js         # Prisma singleton
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   └── App.jsx               # Full React SPA
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MySQL 8+ (XAMPP MySQL supported)
- Redis 7+
- Docker & Docker Compose (optional)

### 1. Clone & Configure

```bash
git clone https://github.com/yourorg/susu-platform
cd susu-platform

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys
```

### 2. Run with Docker

```bash
docker-compose up -d
```

The backend now waits for MySQL and Redis to become healthy before it starts. On startup it also runs database migrations and seeds the default admin account automatically.

### 3. Run Manually

**Backend:**
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run dev
cloudflared tunnel --protocol http2 --url http://localhost:3000
```

**Frontend:**
```bash
cd frontend
npm install
REACT_APP_API_URL=api npm start
```

---

## 🔑 Required API Keys

| Service | Purpose | Get it at |
|---------|---------|-----------|
| Korapay | Payments & disbursements | korapay.com |
| TextBee | SMS notifications | textbee.dev |

### Korapay Setup
1. Create a business account at korapay.com
2. Get your Secret Key from the API settings
3. Set the webhook URL: `https://yourdomain.com/webhooks/korapay`
4. Fill `KORAPAY_SECRET_KEY` and `KORAPAY_WEBHOOK_URL` in `backend/.env`

### TextBee Setup
1. Create account at TextBee
2. Get API key and device ID
3. Use them in `backend/.env`

---

## 📡 API Reference

### Authentication
```
POST /api/auth/register     { phone, name? }
POST /api/auth/verify-otp   { phone, otp }
POST /api/auth/login        { phone }
```

### User
```
GET  /api/user/profile
POST /api/user/set-pin      { pin, confirm_pin }
PUT  /api/user/profile      { name }
```

### Savings
```
POST /api/savings/create-plan   { daily_amount, duration, payout_method, payout_account? }
GET  /api/savings/current
GET  /api/savings/history
POST /api/savings/pause
```

### Transactions
```
GET /api/transactions?page=1&limit=20&type=CONTRIBUTION&status=SUCCESS
```

### Payments
```
POST /api/payments/charge              { plan_id, amount }
POST /api/payments/authorize-otp       { reference, token }
POST /api/payments/resend-otp          { transaction_reference }
POST /api/payments/resend-stk          { transaction_reference }
GET  /api/payments/verify/:ref
```

### Webhooks
```
POST /webhooks/korapay                 (Korapay sends this)
```

### Admin (requires admin phone)
```
GET  /api/admin/users
GET  /api/admin/transactions
GET  /api/admin/stats
POST /api/admin/trigger-contributions
PUT  /api/admin/users/:id/status    { is_active }
POST /api/payout/run                { plan_id }
```

---

## 💰 Financial Flow

```
User registers → Sets PIN → Creates plan (e.g. GHS 10/day × 31 days)
    ↓
Daily 8 AM: Cron job fires
    → BullMQ queues job per active user
    → Worker calls Korapay mobile money API (prompt to payer)
    → Korapay sends webhook → status re-verified → Ledger updated
    → SMS sent to user
    ↓
Day 31: Cycle complete
    → Commission logged (1 day = GHS 10)
    → Net payout = GHS 310 - GHS 10 = GHS 300
    → Korapay transfer API called
    → Funds sent to mobile money
    → User notified via SMS
```

---

## 🔐 Security Features

- JWT sessions (7-day expiry)
- bcrypt PIN hashing (cost factor 12)
- Korapay webhooks re-verified via the transaction status API
- Idempotency keys on all transactions
- Rate limiting (100 req/15min general, 10 req/15min auth)
- Helmet.js security headers
- Input validation on all endpoints
- No direct balance mutations (ledger-only)

---

## ⚡ Scaling Considerations

- **BullMQ** handles thousands of concurrent payment jobs
- **Redis** powers queue persistence and retry logic
- **Prisma** connection pooling via `DATABASE_URL`
- **Cron staggering**: Jobs delayed 0–60s randomly to prevent API floods
- **Webhooks** handle async payment confirmation reliably

---

## 📊 Database Schema

```sql
users           → id, phone, pin_hash, is_active, failed_debits
savings_plans   → id, user_id, daily_amount, duration, status, end_date
transactions    → id, user_id, plan_id, type, amount, status, reference
otp_codes       → id, phone, code, expires_at, used
agents          → id, user_id, commission_rate, total_referrals
```

---

## 🌍 Ghana-specific Optimizations

- Phone validation for Ghana numbers (0XX or +233XX)
- SMS via TextBee (local Ghana gateway)
- Mobile money networks: MTN, Vodafone, AirtelTigo
- Currency: GHS throughout
- Timezone: Africa/Accra for all cron jobs
- Low-bandwidth mobile PWA frontend

---

## 📱 Environment Variables

See `backend/.env.example` for complete list. Key variables:

```env
DATABASE_URL=mysql://root:@localhost:3306/susu_db
# If using XAMPP MySQL from Docker on Windows, set:
# DATABASE_URL=mysql://root:@host.docker.internal:3306/susu_db
JWT_SECRET=your-secret
KORAPAY_SECRET_KEY=your-korapay-secret-key
KORAPAY_WEBHOOK_URL=https://yourdomain.com/webhooks/korapay
AT_API_KEY=...
AT_USERNAME=...
ADMIN_PHONES=+233244000000,+233244000001
COMMISSION_DAYS=1
MAX_RETRY_ATTEMPTS=3
MAX_FAILURES=5
CRON_DEBIT_TIME=0 8 * * *
```

> To seed the initial admin record, make sure your MySQL server is running and then run:
> `cd backend && npm run seed:admin`
