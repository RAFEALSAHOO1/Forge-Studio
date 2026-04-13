# Stripe Payment Integration Setup

## ✅ Implementation Status

The Stripe payment integration is fully implemented and ready to use. Here's what's been set up:

### 1. **Core Files Created**

#### `lib/stripe.ts`
- Initializes Stripe client with `STRIPE_SECRET_KEY`
- Provides `verifyWebhookSignature()` function to securely validate webhook signatures
- Uses Stripe API version `2024-04-10`

#### `app/api/payment/checkout/route.ts`
- **Endpoint**: `POST /api/payment/checkout`
- **Purpose**: Create Stripe checkout sessions
- **Input**: `orderId`, `userId`
- **Process**:
  1. Fetches order from database
  2. Fetches user email
  3. Creates Stripe checkout session with order details
  4. Returns checkout URL for redirect
- **Security**: Rate limited (10 requests per minute per IP)

#### `app/api/payment/webhook/route.ts`
- **Endpoint**: `POST /api/payment/webhook`
- **Purpose**: Handle Stripe webhook events
- **Security**: Verifies webhook signature before processing
- **Handlers**:
  - `checkout.session.completed`: Marks order as "paid", stores `payment_id`
  - `charge.refunded`: Marks order as "refunded"

#### `app/order/page.tsx` (Updated)
- Integrated Stripe checkout flow
- Added loading states and error handling
- Button now creates order → initiates Stripe checkout → redirects to Stripe

### 2. **Database Integration**

The `orders` table already has the required fields:
- `amount`: Stored in cents (e.g., $89.99 = 8999)
- `currency`: 'USD' (default)
- `status`: 'pending' → 'paid' → 'processing' → 'completed'
- `payment_id`: Stores Stripe payment intent ID

### 3. **Environment Variables** (in `.env.local`)

```env
# Stripe Keys (get from dashboard.stripe.com → Developers → API Keys)
STRIPE_SECRET_KEY=sk_test_your_key_here          # Secret key (server-only)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # Publishable key (safe for frontend)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret  # Webhook signing secret

# Base URL (for payment success/cancel URLs)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 🚀 Production Setup Checklist

### Step 1: Create Stripe Account
- Go to [stripe.com](https://stripe.com)
- Sign up for a Stripe account
- Verify email

### Step 2: Get API Keys
1. Log in to Stripe Dashboard
2. Go to **Developers** → **API Keys**
3. You'll see:
   - **Publishable Key** (pk_test_...)
   - **Secret Key** (sk_test_...)
4. Copy both keys to `.env.local`

### Step 3: Set Up Webhook
1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add Endpoint**
3. **Endpoint URL**: `https://yourdomain.com/api/payment/webhook`
4. **Events to listen for**:
   - `checkout.session.completed`
   - `charge.refunded`
5. Click **Add Endpoint**
6. Copy the **Signing Secret** (whsec_...) to `.env.local` as `STRIPE_WEBHOOK_SECRET`

### Step 4: Update Environment Variables
For production, update `.env.local`:
```env
# Production Keys
STRIPE_SECRET_KEY=sk_live_your_production_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_production_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

### Step 5: Test Payment Flow
1. Use Stripe test cards:
   - **Success**: `4242 4242 4242 4242` (any future date, any CVC)
   - **Decline**: `4000 0000 0000 0002`
2. Place an order
3. Verify order status changed from `pending` → `paid`
4. Check Stripe Dashboard confirms payment

---

## 🔒 Security Notes

### ✅ What's Protected
1. **Webhook Signature Verification**: All webhooks are verified using `verifyWebhookSignature()`
2. **Secret Key Protection**: `STRIPE_SECRET_KEY` is never exposed to frontend
3. **Database Validation**: Order ownership verified (user_id check)
4. **Rate Limiting**: Checkout endpoint is rate-limited
5. **HTTPS Only**: Use HTTPS in production (Stripe requires it)

### ⚠️ Important Security Practices
1. **Never** expose `STRIPE_SECRET_KEY` in frontend code
2. **Always** verify webhook signatures before updating database
3. **Never** trust client-side payment data
4. **Always** validate order ownership before payment
5. **Always** use HTTPS for webhook endpoints

---

## 📊 Order Status Flow

```
pending → [Payment Processing] → paid → [Order Fulfillment] → processing → completed
  ↓                                       ↓
[Cancelled]                          [Refund]
                                         ↓
                                      refunded
```

### API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/payment/checkout` | POST | Create Stripe checkout session |
| `/api/payment/webhook` | POST | Handle Stripe webhooks |
| `/api/orders/create` | POST | Create order |
| `/api/orders/list` | GET | List user's orders |
| `/api/orders/[id]` | GET | Get order details |
| `/api/orders/[id]` | PUT | Update order status |
| `/api/admin/orders` | GET | Admin view all orders |

---

## 💡 Next Steps

### Optional Enhancements
1. **Email Notifications** (use Resend)
   - Order confirmation
   - Payment confirmation
   - Shipping notification
   
2. **Order Processing**
   - Auto-generate design file after payment
   - Send to design team

3. **Refunds**
   - Admin dashboard to initiate refunds
   - Auto-refund on cancellation

4. **Analytics**
   - Track payment success rate
   - Revenue reporting
   - Churn analysis

5. **Multi-Currency Support**
   - Add more currencies (EUR, GBP, INR)
   - Auto-convert prices

---

## 🧪 Testing in Development

### Local Testing
1. Ensure `.env.local` has Stripe test keys
2. Run development server
3. Go to `/order` page
4. Select a service and place order
5. Use test card: `4242 4242 4242 4242`
6. Verify payment completes and order status updates to "paid"

### Webhook Testing (Local)
Use Stripe CLI to test webhooks locally:
```bash
# Install Stripe CLI
stripe login

# Forward webhook events to local endpoint
stripe listen --forward-to localhost:3000/api/payment/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

---

## 📚 Resources

- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Docs](https://stripe.com/docs/webhooks)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe API Reference](https://stripe.com/docs/api)

---

## ❓ Troubleshooting

### Issue: "STRIPE_SECRET_KEY is not configured"
- **Solution**: Add `STRIPE_SECRET_KEY` to `.env.local`

### Issue: "Webhook verification failed"
- **Solution**: Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
- **Note**: Webhook secrets are different for test and production keys

### Issue: Payment session not created
- **Solution**: Check order exists in database, user is authenticated

### Issue: Order not marked as paid after payment
- **Solution**: Ensure webhook endpoint is registered in Stripe Dashboard
- **Debug**: Check server logs for webhook errors
