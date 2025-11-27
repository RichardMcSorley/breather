#!/bin/bash

# Test script for OCR API endpoint
# Uses example.PNG from the scripts directory

# Hardcoded values
USER_ID="114223410158772092738"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_IMAGE="${SCRIPT_DIR}/example.PNG"

# Check if example image exists
if [ ! -f "$EXAMPLE_IMAGE" ]; then
  echo "❌ Error: example.PNG not found at ${EXAMPLE_IMAGE}"
  exit 1
fi

# Convert PNG to base64
echo "📸 Reading example image: ${EXAMPLE_IMAGE}"
SCREENSHOT=$(base64 -i "$EXAMPLE_IMAGE" 2>/dev/null || base64 "$EXAMPLE_IMAGE" 2>/dev/null)

if [ -z "$SCREENSHOT" ]; then
  echo "❌ Error: Failed to encode image to base64"
  exit 1
fi

# Get the API URL (default to localhost:3000)
API_URL="${API_URL:-http://localhost:3000}"
ENDPOINT="${API_URL}/api/ocr-text"

echo "🧪 Testing OCR API endpoint: ${ENDPOINT}"
echo "📤 Sending POST request with userId: ${USER_ID}"
echo ""

# Make the request
curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"screenshot\": \"data:image/png;base64,${SCREENSHOT}\"
  }" \
  -w "\n\n📊 Response Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "✅ Test complete!"

