# Screenshot Processing Script

This script processes OCR screenshots using Moondream Station to extract customer information like addresses, names, and order details.

## Prerequisites

1. **Moondream Station** must be running locally:
   ```bash
   moondream-station
   ```
   By default, it runs on `http://localhost:2020/v1`

2. **Python dependencies**:
   Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r scripts/requirements.txt
   ```
   
   **Note**: You'll need to activate the virtual environment each time you run the script:
   ```bash
   source venv/bin/activate
   ```

3. **Environment variables**:
   The script automatically loads environment variables from `.env.local` (or `.env` as fallback) in the project root.
   - `MONGODB_URI` - Your MongoDB connection string
   - `MOONDREAM_ENDPOINT` (optional) - Moondream Station endpoint (default: `http://localhost:2020/v1`)
   
   The script will automatically look for `.env.local` first, then `.env`, and finally fall back to system environment variables.

## Usage

Make sure the virtual environment is activated, then run:

```bash
source venv/bin/activate
python scripts/process_screenshots.py
```

Or make it executable:
```bash
chmod +x scripts/process_screenshots.py
source venv/bin/activate
./scripts/process_screenshots.py
```

## What it does

1. Connects to MongoDB and fetches all OCR entries with screenshots
2. Converts base64 screenshot strings to images
3. Processes each image with Moondream Station to extract:
   - **Caption**: Overall description of the image
   - **Customer Info**: Names, addresses, phone numbers, delivery details
   - **Address**: Specific delivery/customer address
   - **Order Details**: Order numbers, delivery times, items, instructions
4. Prints all results to the console

## Output

The script prints detailed information for each screenshot:
- Entry ID and metadata
- Image dimensions
- Caption of the image
- Extracted customer information
- Address details
- Order/delivery information

## Testing the OCR API Endpoint

The OCR API now processes screenshots immediately when they're submitted. You can test it locally using the provided test scripts.

### Prerequisites

1. **Next.js dev server** must be running:
   ```bash
   npm run dev
   ```

2. **Environment variables** in `.env.local`:
   - `MONGODB_URI` - Your MongoDB connection string
   - `MOONDREAM_ENDPOINT` - Your Moondream endpoint (e.g., `https://yourevilmonk--moondream-server-dev.modal.run`)

### Using the Bash Script (curl)

```bash
# Basic test with default test image
./scripts/test-ocr-api.sh

# Test with custom userId
./scripts/test-ocr-api.sh "my-user-id"

# Test with actual screenshot (base64 encoded)
./scripts/test-ocr-api.sh "my-user-id" "BASE64_ENCODED_IMAGE_STRING"

# Test against different server
API_URL=http://localhost:3001 ./scripts/test-ocr-api.sh
```

### Using the Node.js Script

```bash
# Basic test with default test image
node scripts/test-ocr-api.js

# Test with custom userId
node scripts/test-ocr-api.js "my-user-id"

# Test with actual screenshot file
node scripts/test-ocr-api.js "my-user-id" /path/to/screenshot.png

# Test against different server
API_URL=http://localhost:3001 node scripts/test-ocr-api.js
```

### Using curl directly

```bash
curl -X POST http://localhost:3000/api/ocr-text \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "screenshot": "data:image/png;base64,YOUR_BASE64_IMAGE_HERE"
  }'
```

### Expected Response

On success, you should receive:
```json
{
  "success": true,
  "id": "entry-id-here",
  "message": "OCR screenshot processed and saved successfully",
  "processed": true
}
```

The screenshot will be:
1. Processed immediately with Moondream
2. Extracted data saved to `ocrexports` collection
3. Original OCR entry deleted from `ocrtexts` collection

## Migration Script: Tags and Sources

The migration script updates tags and app names across transactions, customers (OcrExport), and orders (DeliveryOrder) collections.

### Mappings

- "DoorDash" → "Dasher"
- "UberEats" / "Uber Eats" / "Uber" → "Uber Driver"
- "GrubHub" → "GH Drivers"
- "Instacart" → "Shopper"
- "Shipt" → removed (null for transactions/customers, empty string for orders)

### Prerequisites

1. **Environment variables**:
   - `MONGODB_URI` - Your MongoDB connection string (must be set in `.env.local` or `.env`)

2. **Dependencies**:
   - Node.js >= 20.10.0
   - All project dependencies installed (`npm install`)

### Usage

Run the migration script using one of these methods:

**Option 1: Using tsx (recommended)**

If you have `.env.local` or `.env` file, use dotenv-cli to load it:
```bash
npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tags-and-sources.ts
```

Or export the variable first:
```bash
export MONGODB_URI="your-connection-string"
npx tsx scripts/migrate-tags-and-sources.ts
```

**Option 2: Using ts-node**

If you have `.env.local` or `.env` file, use dotenv-cli:
```bash
npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/migrate-tags-and-sources.ts
```

Or export the variable first:
```bash
export MONGODB_URI="your-connection-string"
npx ts-node --esm scripts/migrate-tags-and-sources.ts
```

**Option 3: Compile and run**
```bash
# Compile TypeScript
npx tsc scripts/migrate-tags-and-sources.ts --outDir dist --module esnext --moduleResolution node --esModuleInterop

# Run compiled JavaScript
node dist/scripts/migrate-tags-and-sources.js
```

### What it does

1. Connects to MongoDB using the connection string from environment variables
2. Updates **Transactions** collection:
   - Migrates `tag` field according to mappings
   - Removes "Shipt" tags (sets to null)
3. Updates **OcrExport** (customers) collection:
   - Migrates `appName` field according to mappings
   - Removes "Shipt" app names (sets to null)
4. Updates **DeliveryOrder** (orders) collection:
   - Migrates `appName` field according to mappings
   - Sets "Shipt" app names to empty string (since appName is required)

### Output

The script provides detailed output:
- Progress for each collection
- Number of documents updated per mapping
- Summary statistics
- Error reporting if any issues occur

### Example Output

```
🚀 Starting tag and appName migration...

Mappings:
  - "DoorDash" → "Dasher"
  - "UberEats" → "Uber Driver"
  - "Uber Eats" → "Uber Driver"
  - "GrubHub" → "GH Drivers"
  - "Instacart" → "Shopper"
  - "Shipt" → (removed)

📡 Connecting to MongoDB...
✓ Connected to MongoDB

📊 Migrating Transactions...
  ✓ DoorDash → Dasher: 8 transactions updated
  ✓ UberEats → Uber Driver: 15 transactions updated
  ...

👤 Migrating OcrExport (Customers)...
  ✓ DoorDash → Dasher: 12 customers updated
  ...

📦 Migrating DeliveryOrder (Orders)...
  ✓ DoorDash → Dasher: 5 orders updated
  ...

============================================================
📊 Migration Summary
============================================================

Transactions:
  Updated: 23
  Errors: 0

OcrExport (Customers):
  Updated: 12
  Errors: 0

DeliveryOrder (Orders):
  Updated: 5
  Errors: 0

============================================================
Total Updated: 40
Total Errors: 0
============================================================

✅ Migration completed successfully!
```

### Important Notes

- **Backup your database** before running the migration
- The script performs case-insensitive matching for variations
- For DeliveryOrder, "Shipt" is set to empty string (not null) since `appName` is a required field
- The script is idempotent - safe to run multiple times
- Review the output carefully before proceeding with production data

## Migration Script: Remove Screenshots

The migration script removes the `screenshot` field from all collections to clean up existing screenshot data. This is part of the effort to stop persisting screenshots going forward.

### Prerequisites

1. **Environment variables**:
   - `MONGODB_URI` - Your MongoDB connection string (must be set in `.env.local` or `.env`)

2. **Dependencies**:
   - Node.js >= 20.10.0
   - All project dependencies installed (`npm install`)

### Usage

Run the migration script using one of these methods:

**Option 1: Using tsx (recommended)**

If you have `.env.local` or `.env` file, use dotenv-cli to load it:
```bash
npx dotenv-cli -e .env.local -- npx tsx scripts/remove-screenshots.ts
```

Or export the variable first:
```bash
export MONGODB_URI="your-connection-string"
npx tsx scripts/remove-screenshots.ts
```

**Option 2: Using ts-node**

If you have `.env.local` or `.env` file, use dotenv-cli:
```bash
npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/remove-screenshots.ts
```

Or export the variable first:
```bash
export MONGODB_URI="your-connection-string"
npx ts-node --esm scripts/remove-screenshots.ts
```

### What it does

1. Connects to MongoDB using the connection string from environment variables
2. Removes `screenshot` field from **DeliveryOrder** (orders) collection
3. Removes `screenshot` field from **OcrExport** (customers) collection
4. Removes `screenshot` field from **OcrText** (OCR text entries) collection

### Output

The script provides detailed output:
- Count of documents with screenshots found in each collection
- Number of documents modified per collection
- Summary statistics
- Error reporting if any issues occur

### Example Output

```
🚀 Starting screenshot removal migration...

This will remove the 'screenshot' field from:
  - DeliveryOrder (orders)
  - OcrExport (customers)
  - OcrText (OCR text entries)

📡 Connecting to MongoDB...
✓ Connected to MongoDB

📦 Removing screenshots from DeliveryOrder (Orders)...
  Found 150 orders with screenshots
  ✓ Removed screenshots from 150 orders

👤 Removing screenshots from OcrExport (Customers)...
  Found 200 customers with screenshots
  ✓ Removed screenshots from 200 customers

📄 Removing screenshots from OcrText (OCR Text Entries)...
  Found 50 OCR text entries with screenshots
  ✓ Removed screenshots from 50 OCR text entries

============================================================
📊 Migration Summary
============================================================

DeliveryOrder (Orders):
  Matched: 150
  Modified: 150
  Errors: 0

OcrExport (Customers):
  Matched: 200
  Modified: 200
  Errors: 0

OcrText (OCR Text Entries):
  Matched: 50
  Modified: 50
  Errors: 0

============================================================
Total Matched: 400
Total Modified: 400
Total Errors: 0
============================================================

✅ Migration completed successfully!
   Screenshots have been removed from all collections.

🔌 MongoDB connection closed
```

### Important Notes

- **Backup your database** before running the migration
- This operation is **irreversible** - screenshots will be permanently removed
- The script only removes the `screenshot` field - all other data remains intact
- The script is idempotent - safe to run multiple times (will only affect documents that still have screenshots)
- Review the output carefully before proceeding with production data

