#!/bin/sh
# Start Next.js server
node server.js &

# Wait for server to be ready
sleep 15

# Run cron every 15 minutes
while true; do
  curl -s "http://localhost:3000/api/cron?secret=${CRON_SECRET:-tezcode2026}" > /dev/null 2>&1
  sleep 900
done
