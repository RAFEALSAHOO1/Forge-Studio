#!/data/data/com.termux/files/usr/bin/bash
# Termux-compatible script to start the development server.
cd "$(dirname "$0")/.."
if [ -x "$(command -v npm)" ]; then
  npm run dev
else
  echo "npm is not installed in Termux. Please install nodejs and npm first."
fi
