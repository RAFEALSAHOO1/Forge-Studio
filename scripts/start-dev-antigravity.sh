#!/usr/bin/env bash
# Generic portable run script for Antigravity-style shell environments.
cd "$(dirname "$0")/.."
if [ -x "$(command -v npm)" ]; then
  npm run dev
else
  echo "npm is not installed. Install Node.js and npm before running this script."
fi
