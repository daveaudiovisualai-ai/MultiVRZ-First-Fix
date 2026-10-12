#!/bin/sh
# Copy the built portal (dist-artifact) into deploy/public for the standalone server.
set -e
cd "$(dirname "$0")/.."
rm -rf deploy/public
mkdir -p deploy/public
cp dist-artifact/app.js dist-artifact/app.css deploy/public/
cp -r dist-artifact/assets deploy/public/assets
cp dist-artifact/preview.html deploy/public/index.html
# Version the bundle URLs so browsers fetch the new build after a deploy instead of a cached copy.
JS_V=$(sha256sum deploy/public/app.js | cut -c1-10)
CSS_V=$(sha256sum deploy/public/app.css | cut -c1-10)
sed -i "s#src=\"app.js\"#src=\"app.js?v=$JS_V\"#; s#href=\"app.css\"#href=\"app.css?v=$CSS_V\"#" deploy/public/index.html
echo "deploy/public updated"
