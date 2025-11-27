#!/bin/bash

# Test script for OCR API endpoint
# Processes all images from scripts/images directory

# Hardcoded values
USER_ID="114223410158772092738"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGES_DIR="${SCRIPT_DIR}/images"

# Get the API URL (default to localhost:3000)
API_URL="${API_URL:-http://localhost:3000}"
ENDPOINT="${API_URL}/api/ocr-text"

# Check if images directory exists
if [ ! -d "$IMAGES_DIR" ]; then
  echo "❌ Error: Images directory not found at ${IMAGES_DIR}"
  exit 1
fi

# Find all image files (PNG, JPG, JPEG) and store them
# Use process substitution to handle filenames with spaces
IMAGE_COUNT=0
while IFS= read -r IMAGE; do
  if [ -n "$IMAGE" ]; then
    IMAGES[IMAGE_COUNT]="$IMAGE"
    ((IMAGE_COUNT++))
  fi
done < <(find "$IMAGES_DIR" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) | sort)

if [ $IMAGE_COUNT -eq 0 ]; then
  echo "❌ Error: No image files found in ${IMAGES_DIR}"
  exit 1
fi

echo "🧪 Testing OCR API endpoint: ${ENDPOINT}"
echo "📤 Found ${IMAGE_COUNT} image(s) to process"
echo "👤 User ID: ${USER_ID}"
echo ""
echo "=========================================="
echo ""

# Process each image
SUCCESS_COUNT=0
FAIL_COUNT=0
IMAGE_NUM=0

for IMAGE in "${IMAGES[@]}"; do
  IMAGE_NAME=$(basename "$IMAGE")
  ((IMAGE_NUM++))
  
  echo "📸 [${IMAGE_NUM}/${IMAGE_COUNT}] Processing: ${IMAGE_NAME}"
  
  # Convert image to base64 - handle both macOS and Linux base64 commands
  SCREENSHOT=""
  if [ -f "$IMAGE" ]; then
    # Try macOS style first (with -i flag), then Linux style (stdin)
    SCREENSHOT=$(base64 -i "$IMAGE" 2>/dev/null) || SCREENSHOT=$(base64 < "$IMAGE" 2>/dev/null)
  fi
  
  if [ -z "$SCREENSHOT" ]; then
    echo "   ❌ Error: Failed to encode image to base64 (file: ${IMAGE})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo ""
    continue
  fi
  
  # Make the request
  RESPONSE=$(curl -X POST "${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"${USER_ID}\",
      \"screenshot\": \"data:image/png;base64,${SCREENSHOT}\"
    }" \
    -w "\nHTTP_STATUS:%{http_code}" \
    -s)
  
  HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')
  
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "   ✅ Success (HTTP $HTTP_STATUS)"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "   ❌ Failed (HTTP $HTTP_STATUS)"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  
  echo ""
  echo "----------------------------------------"
  echo ""
done

echo "=========================================="
echo "📊 Summary:"
echo "   ✅ Successful: ${SUCCESS_COUNT}"
echo "   ❌ Failed: ${FAIL_COUNT}"
echo "   📸 Total: ${IMAGE_COUNT}"
echo ""
echo "✅ Test complete!"

