#!/bin/bash

# Register Tesla application for localhost development
# Note: You still need to deploy the public key to production first

echo "Registering Tesla application for localhost..."

# Check if domain is provided
DOMAIN=${1:-"localhost:3000"}

echo "Using domain: $DOMAIN"
echo ""
echo "⚠️  IMPORTANT:"
echo "1. Make sure you've generated the keys: ./scripts/generate-tesla-keys.sh"
echo "2. Deploy the public key to production first"
echo "3. Then register for localhost"
echo ""

# Register for localhost
curl -X POST http://localhost:3000/api/tesla/register \
  -H "Content-Type: application/json" \
  -d "{\"domain\": \"$DOMAIN\"}"

echo ""
echo "✅ Registration complete!"

