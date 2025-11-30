#!/bin/bash

# Script to sync all user Teslas via API endpoint
# This script can be run via cron job for daily syncing
#
# Usage:
#   ./scripts/sync-all-teslas.sh
#
# Environment variables required:
#   - TESLA_SYNC_ALL_API_KEY: API key for authentication
#   - NEXT_PUBLIC_API_URL or API_URL: Base URL of your API (defaults to http://localhost:3000)
#
# Example cron entry (runs daily at 2 AM):
#   0 2 * * * /path/to/scripts/sync-all-teslas.sh >> /var/log/tesla-sync.log 2>&1

set -e

# Get API URL from environment or use default
API_URL="${NEXT_PUBLIC_API_URL:-${API_URL:-http://localhost:3000}}"

# Get API key from environment
API_KEY="${TESLA_SYNC_ALL_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: TESLA_SYNC_ALL_API_KEY environment variable is not set"
  exit 1
fi

# Make the API call
echo "$(date): Starting Tesla sync for all users..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  "${API_URL}/api/tesla/sync-all")

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (all but last line)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "$(date): ✅ Sync completed successfully"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "$(date): ❌ Sync failed with HTTP status $HTTP_CODE"
  echo "$BODY"
  exit 1
fi
