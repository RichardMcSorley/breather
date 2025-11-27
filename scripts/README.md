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

