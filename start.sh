#!/bin/sh
# Copy static assets for standalone output
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# Start Next.js standalone server
node .next/standalone/server.js &

# Wait for server to be ready
sleep 15

# Run cron every 15 minutes
while true; do
  curl -s "http://localhost:3000/api/cron?secret=${CRON_SECRET:-tezcode2026}" > /dev/null 2>&1
  sleep 900
done
