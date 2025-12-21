#!/bin/bash
# Start production build locally

set -e

echo "📦 Building frontend..."
cd frontend
npm run build

echo ""
echo "🦕 Starting Deno backend (serving static + API)..."
cd ../backend
deno task start
