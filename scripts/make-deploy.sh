#!/bin/sh
# Copy the built portal (dist-artifact) into deploy/public for the standalone server.
set -e
cd "$(dirname "$0")/.."
rm -rf deploy/public
mkdir -p deploy/public
cp dist-artifact/app.js dist-artifact/app.css deploy/public/
cp -r dist-artifact/assets deploy/public/assets
cp dist-artifact/preview.html deploy/public/index.html
echo "deploy/public updated"
