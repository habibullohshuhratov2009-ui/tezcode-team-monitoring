#!/bin/sh
node server.js &
sleep 15
while true; do
  curl -s "http://localhost:3000/api/cron?secret=${CRON_SECRET:-tezcode2026}" > /dev/null 2>&1
  sleep 900
done
