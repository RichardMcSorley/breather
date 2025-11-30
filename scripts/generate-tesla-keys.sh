#!/bin/bash

# Generate Tesla API public/private key pair for registration
# This script generates the keys needed for Tesla Fleet API registration

echo "Generating Tesla API key pair..."

# Generate private key
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# Generate public key
openssl ec -in private-key.pem -pubout -out public-key.pem

# Copy public key to the required location for Next.js
mkdir -p public/.well-known/appspecific
cp public-key.pem public/.well-known/appspecific/com.tesla.3p.public-key.pem

echo "✅ Keys generated successfully!"
echo ""
echo "Private key: private-key.pem (KEEP THIS SECRET - DO NOT COMMIT TO GIT)"
echo "Public key: public-key.pem"
echo "Public key hosted at: public/.well-known/appspecific/com.tesla.3p.public-key.pem"
echo ""
echo "⚠️  IMPORTANT:"
echo "1. Add private-key.pem to .gitignore"
echo "2. Deploy the public key to your production domain"
echo "3. Register your application using the /api/tesla/register endpoint"

