#!/usr/bin/env bash
# Start the database setup and then launch the development server.
cd "$(dirname "$0")/.."
npm run dev:db
