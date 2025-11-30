# Breather - Gig Worker Expense Tracker

A Progressive Web App (PWA) for gig workers to track income and expenses with offline support.

## Features

- **Authentication**: Google OAuth via NextAuth.js
- **Transaction Tracking**: Track income and expenses with tags, notes, and dates
- **Recurring Bills**: Manage recurring bills with monthly updates
- **Financial Dashboard**: View breathing room (days off available), free cash, and financial breakdown
- **Offline Support**: Full offline-first architecture with automatic sync when online
- **Mobile-First Design**: Responsive design optimized for mobile devices
- **PWA**: Installable on home screen with offline capabilities

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: MongoDB with Mongoose
- **PWA**: next-pwa for service worker and offline support
- **Styling**: Tailwind CSS
- **Offline Storage**: IndexedDB via idb-keyval

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB database (local or MongoDB Atlas)
- Google OAuth credentials

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env`:

```env
MONGODB_URI=your_mongodb_connection_string
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Tesla API Integration (Optional)
TESLA_CLIENT_ID=your_tesla_client_id
TESLA_CLIENT_SECRET=your_tesla_client_secret
TESLA_REDIRECT_URI=http://localhost:3000/api/tesla/callback
TESLA_API_BASE_URL=https://fleet-api.prd.na.vn.cloud.tesla.com
TESLA_ENCRYPTION_KEY=your_32_character_encryption_key
```

3. Generate a NextAuth secret:

```bash
openssl rand -base64 32
```

4. Set up Google OAuth:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

5. Set up Tesla API integration (optional):
   - Go to [Tesla Developer Portal](https://developer.tesla.com/dashboard)
   - Create a new application
   - Add redirect URI: `http://localhost:3000/api/tesla/callback` (for development)
   - Add redirect URI: `https://your-production-domain.com/api/tesla/callback` (for production)
   - Add allowed origin: `http://localhost:3000` (for development)
   - Add allowed origin: `https://your-production-domain.com` (for production)
   - Copy your Client ID and Client Secret
   - Generate a 32-character encryption key for token storage:
     ```bash
     openssl rand -hex 32
     ```
   - **IMPORTANT**: Register your application in each region:
     - Generate a public/private key pair using the helper script:
       ```bash
       ./scripts/generate-tesla-keys.sh
       ```
       Or manually:
       ```bash
       openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
       openssl ec -in private-key.pem -pubout -out public-key.pem
       mkdir -p public/.well-known/appspecific
       cp public-key.pem public/.well-known/appspecific/com.tesla.3p.public-key.pem
       ```
     - The public key will be automatically hosted at: `https://your-domain/.well-known/appspecific/com.tesla.3p.public-key.pem`
     - Register your application (see Registration section below)

6. Create PWA icons (optional):
   - Create icons in `public/icons/` directory
   - Sizes needed: 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
   - You can use a tool like [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)

7. Run the development server:

```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
/app
  /api                    # API routes
    /auth                 # NextAuth configuration
    /transactions         # Transaction CRUD
    /bills                # Bill CRUD
    /settings             # User settings
    /summary              # Financial summary
  /(dashboard)            # Protected dashboard routes
    /dashboard            # Main dashboard
    /history              # Transaction history
    /bills                # Bills management
    /configuration        # User configuration
  /(auth)                 # Auth routes
    /login                # Login page
/components               # React components
  /ui                    # Reusable UI components
/lib                     # Utilities and models
  /models                # Mongoose schemas
  /offline.ts            # Offline storage utilities
/hooks                   # Custom React hooks
/public                  # Static assets
  /icons                 # PWA icons
  manifest.json          # PWA manifest
```

## Usage

### Configuration

1. Sign in with Google
2. Go to Configuration page
3. Set your financial settings:
   - Total Liquid Cash
   - Monthly Burn Rate
   - Fixed Expenses
   - Estimated Tax Rate

### Adding Transactions

1. From the Dashboard, click the **+** button for income or **−** button for expenses
2. Fill in the transaction details:
   - Amount
   - Date and time
   - Income source tag (for income)
   - Notes (optional)
   - Mark as bill (optional)

### Managing Bills

1. Go to Bills page
2. Click "Add Bill" to create a recurring bill
3. Set the bill name, amount, and due date (day of month)
4. When paying a bill, click "Pay" to create a transaction linked to the bill

### Viewing History

1. Go to History page
2. Filter by type (All/Income/Expense) or by income source tag
3. Edit or delete transactions as needed

### Tesla Integration (Optional)

**Prerequisites:**
1. Your application must be registered in each region you want to use
2. You must host a public key at `https://your-domain/.well-known/appspecific/com.tesla.3p.public-key.pem`

**Registration:**
After setting up your Tesla application, you need to register it in each region:

1. Generate a public/private key pair:
   ```bash
   openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem
   openssl ec -in private-key.pem -pubout -out public-key.pem
   ```

2. Host the public key on your domain at:
   ```
   https://your-domain/.well-known/appspecific/com.tesla.3p.public-key.pem
   ```

3. Register the application:
   
   **For Production (Recommended):**
   ```bash
   # First, make sure your dev server is running, then:
   curl -X POST https://breather-chi.vercel.app/api/tesla/register \
     -H "Content-Type: application/json" \
     -d '{"domain": "breather-chi.vercel.app"}'
   ```
   
   **For Localhost Development:**
   ```bash
   # Make sure your dev server is running (npm run dev), then:
   ./scripts/register-tesla-localhost.sh
   # Or manually:
   curl -X POST http://localhost:3000/api/tesla/register \
     -H "Content-Type: application/json" \
     -d '{"domain": "localhost:3000"}'
   ```
   
   **Note**: 
   - The domain must match your `allowed_origins` from the Tesla Developer Dashboard (without `https://` or `http://`)
   - For localhost, Tesla cannot verify the public key, so you may need to register production first
   - Once registered for production, it typically works for localhost too

**Using Tesla Integration:**
1. Go to Configuration page
2. Scroll to "Tesla Integration" section
3. Click "Connect Tesla Account"
4. Authorize the app in Tesla's OAuth flow
5. Once connected, click "Sync Now" to import your current odometer reading
6. New mileage entries will be created automatically when the odometer increases by 0.1 miles or more

## Offline Support

The app works offline and automatically syncs when you come back online:

- All mutations (create, update, delete) are queued when offline
- Data is cached for viewing offline
- Automatic sync when connection is restored
- Manual sync button available in the offline indicator

## Testing

The project uses Vitest for testing with comprehensive coverage of utilities, hooks, API routes, and components.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run tests in CI mode
npm run test:ci
```

### Test Structure

```
/__tests__
  /api/              # API route integration tests
  /components/       # Component tests
  /hooks/            # Hook tests
  /lib/              # Utility function tests
  /utils/            # Test utilities and helpers
    /mocks/          # MSW handlers
    /setup/          # Database setup
```

### Writing Tests

- **Unit Tests**: Test individual functions and utilities in isolation
- **Integration Tests**: Test API routes with in-memory MongoDB
- **Component Tests**: Test React components with React Testing Library

### Test Coverage Goals

- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Testing Best Practices

- Use MSW to mock API calls in component/hook tests
- Use mongodb-memory-server for API route tests
- Test both happy paths and error scenarios
- Use React Testing Library best practices (test user behavior, not implementation)
- Mock external dependencies appropriately

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The app will automatically build and deploy.

## License

MIT


