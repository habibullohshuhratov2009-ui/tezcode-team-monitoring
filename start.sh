#!/bin/sh
# Start Next.js server
node server.js &

# Wait for server to be ready
sleep 10

# Run cron every 15 minutes
while true; do
  curl -s "http://localhost:3000/api/cron?secret=${CRON_SECRET}" > /dev/null 2>&1
  sleep 900
done
