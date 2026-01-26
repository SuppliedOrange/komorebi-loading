#!/bin/bash

# Local Build Test Script
# This script simulates the GitHub Actions workflow locally
# Run this script from the repository root directory

set -e

echo "===== Local Build Test for komorebi-loading ====="
echo ""

# Step 1: Install dependencies
echo "Step 1: Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Step 2: Build Windows executable
echo "Step 2: Building Windows executable..."
npx @electron/packager . komorebi-loading --out=dist --icon=assets/cat.ico --overwrite --platform=win32
echo "✓ Build complete"
echo ""

# Step 3: Create ZIP archive
echo "Step 3: Creating ZIP archive..."
cd dist
APP_DIR=$(find . -maxdepth 1 -type d -name "komorebi-loading-*" | head -n 1)
if [ -n "$APP_DIR" ]; then
    cd "$APP_DIR"
    VERSION=$(node -p "require('../../package.json').version")
    zip -r "../../komorebi-loading-v${VERSION}-local-win32.zip" .
    cd ../..
    echo "✓ ZIP archive created: komorebi-loading-v${VERSION}-local-win32.zip"
else
    echo "✗ Error: Could not find packaged app directory"
    exit 1
fi
echo ""

# Step 4: Show results
echo "===== Build Summary ====="
ls -lh komorebi-loading-v*-local-win32.zip
echo ""
echo "Build completed successfully!"
echo "You can find the build in: $(pwd)/komorebi-loading-v${VERSION}-local-win32.zip"
