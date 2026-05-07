#!/bin/bash
# Tezcode Monitor — Claude token + git commits + work hours
# Setup:  echo "ttm_live_YOUR_TOKEN" > ~/.tezcode_token
#         chmod 600 ~/.tezcode_token
# Cron:   */15 * * * * /path/to/tezcode-monitor.sh >> ~/.tezcode_monitor.log 2>&1

set -euo pipefail

SERVER="${TEZCODE_SERVER:-https://token-nazorat.up.railway.app}"
TOKEN="${TEZCODE_TOKEN:-}"
WORK_DIR="${TEZCODE_WORK_DIR:-$HOME}"  # Root dir to scan for git repos

if [ -z "$TOKEN" ] && [ -f "$HOME/.tezcode_token" ]; then
  TOKEN=$(cat "$HOME/.tezcode_token" | tr -d '[:space:]')
fi

if [ -z "$TOKEN" ]; then
  echo "[tezcode] Error: token topilmadi. ~/.tezcode_token faylini yarating."
  exit 1
fi

# ── 1. Claude token usage (last 5 hours = reset window) ─────────────────────
CLAUDE_USED=0
CLAUDE_LIMIT=500000
CLAUDE_WINDOW="5h"
PROJECTS_DIR="$HOME/.claude/projects"

if [ -d "$PROJECTS_DIR" ]; then
  CLAUDE_USED=$(find "$PROJECTS_DIR" -name "*.jsonl" -mmin -300 2>/dev/null \
    -exec cat {} + 2>/dev/null \
    | python3 -c "
import sys, json
total = 0
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
        usage = d.get('message', {}).get('usage', d.get('usage', {}))
        total += usage.get('input_tokens', 0) + usage.get('output_tokens', 0)
    except Exception:
        pass
print(total)
" 2>/dev/null || echo 0)
fi

# ── 2. Git commits (last 24 hours across all repos) ─────────────────────────
COMMITS_JSON="[]"

COMMITS_JSON=$(find "$WORK_DIR" -maxdepth 4 -name ".git" -type d 2>/dev/null \
  | while read -r git_dir; do
    repo_dir=$(dirname "$git_dir")
    repo_name=$(basename "$repo_dir")
    branch=$(git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

    git -C "$repo_dir" log \
      --since="24 hours ago" \
      --format="%H|%s|%ai" \
      --author="$(git -C "$repo_dir" config user.email 2>/dev/null || echo '')" \
      2>/dev/null \
    | while IFS='|' read -r hash msg date; do
      [ -z "$hash" ] && continue
      # Escape JSON special chars in message
      safe_msg=$(echo "$msg" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo "\"commit\"")
      echo "{\"hash\":\"$hash\",\"message\":$safe_msg,\"branch\":\"$branch\",\"repoName\":\"$repo_name\",\"ts\":\"$date\"}"
    done
  done | python3 -c "
import sys, json
commits = []
seen = set()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        c = json.loads(line)
        if c['hash'] not in seen:
            seen.add(c['hash'])
            commits.append(c)
    except Exception:
        pass
print(json.dumps(commits))
" 2>/dev/null || echo "[]")

# ── 3. Work minutes (active screen time today via last login + uptime) ───────
WORK_MINUTES=0
# Heuristic: count minutes since first activity today (login or boot, whichever is later)
BOOT_SECONDS=$(sysctl -n kern.boottime 2>/dev/null \
  | python3 -c "import sys,re,time; m=re.search(r'sec = (\d+)',sys.stdin.read()); print(int(time.time())-int(m.group(1))) if m else print(0)" 2>/dev/null || echo 0)

TODAY_START=$(date -v0H -v0M -v0S '+%s' 2>/dev/null || date -d 'today 00:00:00' '+%s' 2>/dev/null || echo 0)
ACTIVE_SINCE=$(( BOOT_SECONDS > TODAY_START ? BOOT_SECONDS : TODAY_START ))
NOW=$(date '+%s')
WORK_MINUTES=$(( (NOW - ACTIVE_SINCE) / 60 ))

# ── 4. Send to server ─────────────────────────────────────────────────────────
PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'claudeUsed': $CLAUDE_USED,
    'claudeLimit': $CLAUDE_LIMIT,
    'claudeWindow': '$CLAUDE_WINDOW',
    'workMinutes': $WORK_MINUTES,
    'commits': $COMMITS_JSON
}))
" 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  PAYLOAD="{\"claudeUsed\":$CLAUDE_USED,\"claudeLimit\":$CLAUDE_LIMIT,\"claudeWindow\":\"$CLAUDE_WINDOW\",\"workMinutes\":$WORK_MINUTES,\"commits\":[]}"
fi

HTTP_STATUS=$(curl -s -w "%{http_code}" -o /tmp/tezcode_response.txt -X POST "$SERVER/api/heartbeat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$HTTP_STATUS" = "200" ]; then
  COMMIT_COUNT=$(echo "$COMMITS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
  echo "[tezcode $(date '+%H:%M')] OK — claude:${CLAUDE_USED}/${CLAUDE_LIMIT} | commits:${COMMIT_COUNT} | work:${WORK_MINUTES}min"
else
  echo "[tezcode $(date '+%H:%M')] Xato HTTP $HTTP_STATUS: $(cat /tmp/tezcode_response.txt 2>/dev/null)"
fi
