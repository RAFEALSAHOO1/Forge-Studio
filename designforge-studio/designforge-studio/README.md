# DesignForge Studio — Complete Frontend + Backend

A **production-ready** premium design service platform built with Next.js 14, TypeScript, Tailwind CSS, and Framer Motion. This is a full-stack web application for a design marketplace where users can browse, customize, and order design services.

## ✨ Features

- **🏠 Landing Page**: Cinematic hero sections, product highlights, and service showcases
- **🛒 Product Catalog**: Browse designs by category (logos, websites, branding, etc.)
- **🎨 Design Customizer (The Forge)**: Interactive design preview with real-time animations
- **👤 User Authentication**: Google OAuth integration with NextAuth.js
- **📊 Dashboard**: User profile, order history, and design management
- **🛍️ Order System**: 3-step wizard for placing orders with payment integration
- **💳 Payment Processing**: Stripe integration for secure payments
- **📧 Email Notifications**: Automated emails via Resend
- **📈 Analytics**: Google Analytics 4 integration
- **🛡️ Admin Panel**: Manage orders, users, and platform analytics
- **🌙 Dark/Light Theme**: System-aware theme switching
- **📱 Responsive Design**: Mobile-first approach with liquid glass UI
- **🔒 Security**: Rate limiting, CSRF protection, and secure headers
- **⚡ Performance**: Optimized with Next.js 14, server-side rendering, and lazy loading

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **UI Components**: Custom component library with glass morphism effects

### Backend
- **Runtime**: Node.js
- **Database**: PostgreSQL (Neon)
- **ORM**: Direct SQL queries with Neon serverless
- **Authentication**: NextAuth.js with Google OAuth
- **Payments**: Stripe
- **Email**: Resend
- **Analytics**: Google Analytics 4

### DevOps & Tools
- **Deployment**: Vercel
- **Version Control**: Git
- **Package Manager**: npm
- **Linting**: ESLint
- **Type Checking**: TypeScript
- **Build Tool**: Next.js built-in

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/RAFEALSAHOO1/FORGE-STUDIO.git
cd FORGE-STUDIO/designforge-studio

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env.local

# 4. Fill in your environment variables (see Environment Variables section)

# 5. Set up the database
npm run db:setup

# 6. Run development server
npm run dev

# 7. Open http://localhost:3000 in your browser
```

## 🌍 Environment Variables

Create `.env.local` from the template below. All variables are required for full functionality.

```env
# ── App Configuration ────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="DesignForge Studio"

# ── Google Analytics 4 ───────────────────────────────────────────────────────────
# Get from: analytics.google.com → Admin → Data Streams
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# ── Google OAuth ────────────────────────────────────────────────────────────────
# Get from: console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

# ── Database ────────────────────────────────────────────────────────────────────
# Neon: neon.tech (recommended)
# Supabase: supabase.com
# Format: postgresql://user:password@host:5432/database
DATABASE_URL=postgresql://neondb_owner:npg_PLdMq0RC8mVj@ep-lucky-sea-a1vwkk4d-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
NEON_DATABASE_URL=postgresql://neondb_owner:npg_PLdMq0RC8mVj@ep-lucky-sea-a1vwkk4d-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# ── Stripe Payments ─────────────────────────────────────────────────────────────
# Get from: dashboard.stripe.com → Developers → API Keys
STRIPE_SECRET_KEY=sk_test_your_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
# Get webhook secret from: dashboard.stripe.com → Webhooks
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# ── Email Service ───────────────────────────────────────────────────────────────
# Get from: resend.com → API Keys
RESEND_API_KEY=re_your_api_key
FROM_EMAIL=noreply@designforge.studio
SUPPORT_EMAIL=support@designforge.studio

# ── Authentication ──────────────────────────────────────────────────────────────
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your-generated-secret-here
NEXTAUTH_URL=http://localhost:3000

# ── File Storage (Optional) ─────────────────────────────────────────────────────
# Cloudflare R2 or AWS S3 for file uploads
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=designforge-uploads
# R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
```

## 📁 Project Structure

```
designforge-studio/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Landing page with all sections
│   ├── layout.tsx                # Root layout with fonts and analytics
│   ├── globals.css               # Global styles and design system
│   ├── error.tsx                 # Error boundary for pages
│   ├── global-error.tsx          # Global error boundary
│   ├── not-found.tsx             # 404 page
│   ├── about/                    # About page
│   ├── admin/                    # Admin dashboard
│   ├── browse/                   # Product browsing
│   │   ├── page.tsx              # Browse all products
│   │   ├── [id]/                 # Individual product page
│   │   └── category/[category]/  # Category-specific browsing
│   ├── contact/                  # Contact form
│   ├── dashboard/                # User dashboard
│   ├── forge/                    # Design customizer
│   ├── login/                    # Login page
│   ├── signup/                   # Registration page
│   ├── order/                    # Order placement wizard
│   ├── order-tracking/           # Order status tracking
│   ├── payment/                  # Payment processing
│   ├── privacy/                  # Privacy policy
│   ├── profile/                  # User profile
│   ├── settings/                 # User settings
│   ├── status/                   # System status
│   ├── terms/                    # Terms of service
│   └── api/                      # API routes
│       ├── analytics/            # Analytics tracking
│       ├── auth/                 # Authentication endpoints
│       ├── designs/              # Design management
│       │   └── [id]/             # Individual design operations
│       ├── orders/               # Order management
│       ├── payment/              # Payment webhooks
│       │   ├── create/           # Create payment session
│       │   ├── verify/           # Verify payment
│       │   └── webhook/          # Stripe webhooks
│       └── templates/            # Product templates
├── components/                   # Reusable UI components
│   ├── layout/                   # Layout components
│   │   ├── Navbar.tsx            # Navigation bar
│   │   └── Footer.tsx            # Footer
│   ├── sections/                 # Page sections
│   │   ├── HeroSection.tsx       # Hero section
│   │   ├── LandingSections.tsx   # Landing page sections
│   │   └── ProductHighlights.tsx # Product showcase
│   ├── heroes/                   # Hero variants
│   │   ├── TargoHero.tsx         # Logistics-style hero
│   │   └── VEXHero.tsx           # Animated typography hero
│   └── ui/                       # UI components
│       ├── AdminTable.tsx        # Admin data tables
│       ├── AnalyticsProvider.tsx # Analytics context
│       ├── Card.tsx              # Card component
│       ├── Checkbox.tsx          # Custom checkbox
│       ├── ForgeAnimations.tsx   # Design animations
│       ├── LoadingScreen.tsx     # Loading screen
│       ├── MorphismEffects.tsx   # Glass morphism effects
│       ├── OrderTimeline.tsx     # Order progress
│       ├── PageLoading.tsx       # Page loader
│       ├── PodaInput.tsx         # Custom input
│       ├── Reviews.tsx           # Review components
│       ├── Skeleton.tsx          # Loading skeletons
│       ├── ThemeToggle.tsx       # Theme switcher
│       ├── Toast.tsx             # Toast notifications
│       └── UiverseButton.tsx     # Animated button
├── lib/                          # Utility libraries
│   ├── analytics.ts              # Analytics helpers
│   ├── auth-context.tsx          # Authentication context
│   ├── colors.ts                 # Color constants
│   ├── db-config.ts              # Database configuration
│   ├── db.ts                     # Database utilities
│   ├── fonts.ts                  # Font loading
│   ├── morphism-tokens.ts        # Design tokens
│   ├── products.ts               # Product data
│   ├── theme-context.tsx         # Theme context
│   └── utils.ts                  # General utilities
├── public/                       # Static assets
├── scripts/                      # Setup and utility scripts
│   ├── setup-db-pg.ts            # PostgreSQL setup
│   ├── setup-db-simple.ts        # Simple setup
│   ├── setup-db.ts               # Database setup
│   └── test-db.ts                # Database testing
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules
├── middleware.ts                 # Next.js middleware
├── next.config.mjs               # Next.js configuration
├── next.config.ts                # Additional config
├── package.json                  # Dependencies and scripts
├── postcss.config.js             # PostCSS configuration
├── README.md                     # This file
├── schema.sql                    # Database schema
├── tailwind.config.ts            # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── IMPLEMENTATION_SUMMARY.md     # Implementation details
```

## 🎨 Design System

### Liquid Glass Morphism
The app features a custom "liquid glass" design system with:
- **Glass Effects**: Backdrop blur, transparency, and subtle borders
- **Morphing Animations**: Smooth transitions and hover effects
- **Gradient Overlays**: Dynamic color shifts
- **Particle Systems**: Interactive background elements

### Color Palette
- **Primary**: `#89AACC` (Soft Blue)
- **Secondary**: `#4E85BF` (Deep Blue)
- **Background**: `#0a0a0a` (Dark)
- **Surface**: Semi-transparent overlays
- **Text**: `#f5f5f5` (Light)
- **Muted**: `#888888` (Gray)

### Typography
- **Display**: Instrument Serif (Italic for headings)
- **Body**: Inter (300-600 weights)
- **Accent**: Rubik (Bold for CTAs)

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signin/google` - Google OAuth login
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signout` - Logout

### Designs
- `GET /api/designs` - List user designs
- `POST /api/designs` - Create new design
- `GET /api/designs/[id]` - Get design details
- `PUT /api/designs/[id]` - Update design
- `DELETE /api/designs/[id]` - Delete design

### Orders
- `GET /api/orders` - List user orders
- `POST /api/orders` - Create new order

### Products
- `GET /api/templates` - List available products
- `GET /api/templates/[id]` - Get product details

### Payments
- `POST /api/payment/create` - Create Stripe checkout session
- `POST /api/payment/verify` - Verify payment completion
- `POST /api/payment/webhook` - Stripe webhook handler

### Analytics
- `POST /api/analytics` - Track user events

## 🛠️ Development Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type checking

# Database
npm run db:setup     # Set up database schema
npm run db:test      # Test database connection

# Deployment
npm run build        # Build the application
```

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Visit: vercel.com → Your Project → Settings → Environment Variables
```

### Manual Deployment
1. Build the application: `npm run build`
2. Start production server: `npm run start`
3. Configure reverse proxy (nginx/apache) for production

## 🔧 Configuration

### Database Setup
The app uses PostgreSQL with the following schema:
- `users` - User accounts
- `designs` - User designs
- `orders` - Order records

Run `npm run db:setup` to initialize the database.

### Payment Integration
Stripe is configured for payment processing. Set up webhooks in your Stripe dashboard pointing to `/api/payment/webhook`.

### Email Configuration
Resend is used for transactional emails. Configure templates for order confirmations and notifications.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, email support@designforge.studio or create an issue in this repository.

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- Vercel for hosting and deployment
- Tailwind CSS for utility-first styling
- Framer Motion for animations
- All contributors and open-source projects used

---

## 📋 Pages Checklist

| Page | Route | Status |
|------|-------|--------|
| Landing | `/` | ✅ |
| Browse | `/browse` | ✅ |
| Product Detail | `/browse/[id]` | ✅ |
| The Forge | `/forge` | ✅ |
| About | `/about` | ✅ |
| Contact | `/contact` | ✅ |
| Login | `/login` | ✅ |
| Sign Up | `/signup` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| Profile | `/profile` | ✅ |
| Settings | `/settings` | ✅ |
| Place Order | `/order` | ✅ |
| Track Order | `/order-tracking` | ✅ |
| Payment | `/payment` | ✅ |
| Admin Panel | `/admin` | ✅ |
| Privacy Policy | `/privacy` | ✅ |
| Terms | `/terms` | ✅ |
| Maintenance | `/maintenance` | ✅ |
| System Status | `/status` | ✅ |
| 404 | `/not-found` | ✅ |
| Error | `/error` | ✅ |

---

## 🔒 Security Features

- ✅ Rate limiting (60 req/min API, 300 req/min pages)
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Input sanitization on all API routes
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection headers
- ✅ CORS via Next.js built-in

---

Built with ❤️ using Next.js 14, TypeScript, Tailwind CSS, Framer Motion
