import { NextResponse } from "next/server"

const SCRIPT = `#!/bin/bash
# Tezcode Monitor — Claude token + git commits + work hours
# O'rnatish: echo "ttm_live_TOKEN" > ~/.tezcode_token && chmod 600 ~/.tezcode_token

SERVER="\${TEZCODE_SERVER:-https://tezcode-team-monitoring-production.up.railway.app}"
TOKEN="\${TEZCODE_TOKEN:-}"
WORK_DIR="\${TEZCODE_WORK_DIR:-$HOME}"

if [ -z "$TOKEN" ] && [ -f "$HOME/.tezcode_token" ]; then
  TOKEN=$(cat "$HOME/.tezcode_token" | tr -d '[:space:]')
fi

if [ -z "$TOKEN" ]; then
  echo "[tezcode] Error: token topilmadi. ~/.tezcode_token faylini yarating."
  exit 1
fi

CLAUDE_USED=0
CLAUDE_LIMIT=$(cat "$HOME/.tezcode_claude_limit" 2>/dev/null | tr -d '[:space:]')
CLAUDE_LIMIT="\${CLAUDE_LIMIT:-88000}"
CLAUDE_WINDOW="session"
PROJECTS_DIR="$HOME/.claude/projects"
WEEKLY_OUTPUT_TOKENS=0

# Weekly tokens from JSONL (last 7 days) — always calculated
if [ -d "$PROJECTS_DIR" ]; then
  WEEKLY_OUTPUT_TOKENS=$(find "$PROJECTS_DIR" -name "*.jsonl" -mmin -10080 2>/dev/null \
    -exec cat {} + 2>/dev/null \
    | python3 -c "
import sys, json
total = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        usage = d.get('message', {}).get('usage', d.get('usage', {}))
        total += usage.get('output_tokens', 0)
    except: pass
print(total)
" 2>/dev/null) || true
  WEEKLY_OUTPUT_TOKENS="\${WEEKLY_OUTPUT_TOKENS:-0}"
fi

# Real Claude.ai session % via Chrome cookies → /api/organizations/{id}/usage
_claude_pct=$(python3 -c "
import sqlite3, shutil, subprocess, hashlib, json, sys, urllib.request
from pathlib import Path

def chrome_key():
    try:
        pw = subprocess.check_output(
            ['security','find-generic-password','-wa','Chrome Safe Storage'],
            stderr=subprocess.DEVNULL
        ).strip()
        return hashlib.pbkdf2_hmac('sha1', pw, b'saltysalt', 1003, dklen=16)
    except: return None

def decrypt(key, enc):
    try:
        from Crypto.Cipher import AES
        dec = AES.new(key, AES.MODE_CBC, b' '*16).decrypt(enc[3:])
        return dec[:-dec[-1]].decode('utf-8', errors='ignore')
    except: return ''

db = Path.home() / 'Library/Application Support/Google/Chrome/Default/Cookies'
if not db.exists():
    db = Path.home() / 'Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies'
    svc = 'Brave Safe Storage'
else:
    svc = 'Chrome Safe Storage'
if not db.exists(): sys.exit(0)

tmp = Path('/tmp/_tczcd.db')
shutil.copy2(db, tmp)

def get_key(service):
    try:
        pw = subprocess.check_output(
            ['security','find-generic-password','-wa',service],
            stderr=subprocess.DEVNULL
        ).strip()
        return hashlib.pbkdf2_hmac('sha1', pw, b'saltysalt', 1003, dklen=16)
    except: return None

key = get_key(svc)
conn = sqlite3.connect(str(tmp))
rows = conn.execute('SELECT name,value,encrypted_value FROM cookies WHERE host_key LIKE ?', ('%claude.ai%',)).fetchall()
conn.close()
try: tmp.unlink()
except: pass

c = {}
for name, val, enc in rows:
    if enc and len(enc) > 3 and enc[:3] == b'v10' and key:
        v = decrypt(key, enc)
        if v: c[name] = v
    elif val: c[name] = val
if not c: sys.exit(0)

ck = '; '.join(k + '=' + v for k, v in c.items())
hdrs = {'Cookie': ck, 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
try:
    req = urllib.request.Request('https://claude.ai/api/organizations', headers=hdrs)
    with urllib.request.urlopen(req, timeout=8) as r:
        orgs = json.loads(r.read().decode())
    oid = ''
    if isinstance(orgs, list) and orgs:
        oid = str(orgs[0].get('uuid') or orgs[0].get('id') or '')
    if not oid: sys.exit(0)
    req2 = urllib.request.Request('https://claude.ai/api/organizations/' + oid + '/usage', headers=hdrs)
    with urllib.request.urlopen(req2, timeout=8) as r2:
        u = json.loads(r2.read().decode())
    pct5 = u.get('five_hour', {}).get('utilization')
    pct7 = u.get('seven_day', {}).get('utilization')
    out = []
    if pct5 is not None: out.append(str(round(float(pct5))))
    if pct7 is not None: out.append(str(round(float(pct7))))
    if out: print(' '.join(out))
except: sys.exit(0)
" 2>/dev/null) || true

_api_out="$_claude_pct"
_claude_pct=$(echo "$_api_out" | awk '{print $1}')
_weekly_pct=$(echo "$_api_out" | awk '{print $2}')
WEEKLY_PERCENT="\${_weekly_pct}"

if [ -n "$_claude_pct" ] && [ "$_claude_pct" -ge 0 ] 2>/dev/null; then
  CLAUDE_USED=$(( _claude_pct * CLAUDE_LIMIT / 100 ))
fi

COMMITS_JSON="[]"
_raw_commits=$(
  find "$WORK_DIR" -maxdepth 10 -name ".git" -type d 2>/dev/null \
  | while read -r git_dir; do
      repo_dir=$(dirname "$git_dir")
      repo_name=$(basename "$repo_dir")
      branch=$(git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
      author=$(git -C "$repo_dir" config user.email 2>/dev/null || echo "")
      [ -z "$author" ] && continue
      git -C "$repo_dir" log --since="24 hours ago" --format="%H|%s|%ai" --author="$author" 2>/dev/null \
      | while IFS='|' read -r hash msg date; do
          [ -z "$hash" ] && continue
          safe_msg=$(python3 -c "import sys,json; print(json.dumps('$msg'))" 2>/dev/null || echo '"commit"')
          printf '{"hash":"%s","message":%s,"branch":"%s","repoName":"%s","ts":"%s"}\\n' "$hash" "$safe_msg" "$branch" "$repo_name" "$date"
        done
    done
) || true

if [ -n "$_raw_commits" ]; then
  COMMITS_JSON=$(echo "$_raw_commits" | python3 -c "
import sys, json
commits, seen = [], set()
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        c = json.loads(line)
        if c['hash'] not in seen:
            seen.add(c['hash'])
            commits.append(c)
    except: pass
print(json.dumps(commits))
" 2>/dev/null) || true
  COMMITS_JSON="\${COMMITS_JSON:-[]}"
fi

SCREEN_ON="true"
if pgrep -x "ScreenSaverEngine" > /dev/null 2>&1; then SCREEN_ON="false"; fi

TODAY_START=$(date -v0H -v0M -v0S '+%s' 2>/dev/null || echo 0)
BOOT_TS=$(sysctl -n kern.boottime 2>/dev/null | python3 -c "import sys,re; m=re.search(r'sec = (\\d+)',sys.stdin.read()); print(m.group(1)) if m else print(0)" 2>/dev/null) || true
BOOT_TS="\${BOOT_TS:-0}"
ACTIVE_SINCE=$(( BOOT_TS > TODAY_START ? BOOT_TS : TODAY_START ))
NOW=$(date '+%s')
WORK_MINUTES=$(( (NOW - ACTIVE_SINCE) / 60 ))

PAYLOAD=$(python3 -c "
import json
d={'claudeUsed':$CLAUDE_USED,'claudeLimit':$CLAUDE_LIMIT,'claudeWindow':'$CLAUDE_WINDOW','weeklyOutputTokens':$WEEKLY_OUTPUT_TOKENS,'workMinutes':$WORK_MINUTES,'commits':$COMMITS_JSON,'screenOn':$SCREEN_ON}
wp='$WEEKLY_PERCENT'
if wp.isdigit(): d['weeklyPercent']=int(wp)
print(json.dumps(d))
" 2>/dev/null) || true

if [ -z "$PAYLOAD" ]; then
  PAYLOAD="{\\"claudeUsed\\":$CLAUDE_USED,\\"claudeLimit\\":$CLAUDE_LIMIT,\\"claudeWindow\\":\\"$CLAUDE_WINDOW\\",\\"weeklyOutputTokens\\":$WEEKLY_OUTPUT_TOKENS,\\"workMinutes\\":$WORK_MINUTES,\\"commits\\":[]}"
fi

HTTP_STATUS=$(curl -s -w "%{http_code}" -o /tmp/tezcode_resp.txt -X POST "$SERVER/api/heartbeat" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$PAYLOAD") || true

if [ "$HTTP_STATUS" = "200" ]; then
  echo "[tezcode $(date '+%H:%M')] OK — claude:\${CLAUDE_USED}/\${CLAUDE_LIMIT} | work:\${WORK_MINUTES}min"
else
  echo "[tezcode $(date '+%H:%M')] Xato HTTP \${HTTP_STATUS:-000}: $(cat /tmp/tezcode_resp.txt 2>/dev/null)"
fi
`

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=tezcode-monitor.sh",
    },
  })
}
