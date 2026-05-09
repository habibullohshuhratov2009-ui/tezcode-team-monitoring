import { NextResponse } from "next/server"

export async function GET() {
  return new NextResponse(getScript(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=tezcode-monitor.ps1",
    },
  })
}

function getScript(): string {
  return `# Tezcode Monitor — Claude token + git commits + work hours (Windows)
# O'rnatish:
#   "ttm_live_YOUR_TOKEN" | Out-File "$env:USERPROFILE\\.tezcode_token" -Encoding utf8
#   .\\tezcode-monitor.ps1 -Install

param([switch]$Install)

$SERVER   = if ($env:TEZCODE_SERVER) { $env:TEZCODE_SERVER } else { "https://tezcode-team-monitoring-production.up.railway.app" }
$WORK_DIR = if ($env:TEZCODE_WORK_DIR) { $env:TEZCODE_WORK_DIR } else { $env:USERPROFILE }
$LOG_FILE = "$env:USERPROFILE\\.tezcode_monitor.log"

if ($Install) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -WindowStyle Hidden -File \`"$scriptPath\`""
    $trigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 15) -Once -At (Get-Date)
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable
    Register-ScheduledTask -TaskName "TezcodeMonitor" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
    Write-Host "[tezcode] Task Scheduler ga qo'shildi. Har 15 daqiqada ishga tushadi."
    exit 0
}

$TOKEN = $env:TEZCODE_TOKEN
if (-not $TOKEN) {
    $tokenFile = "$env:USERPROFILE\\.tezcode_token"
    if (Test-Path $tokenFile) { $TOKEN = (Get-Content $tokenFile -Raw).Trim() }
}
if (-not $TOKEN) {
    Write-Host "[tezcode] Xato: token topilmadi."
    exit 1
}

$claudeLimit = 88000
$limitFile = "$env:USERPROFILE\\.tezcode_claude_limit"
if (Test-Path $limitFile) { $claudeLimit = [int](Get-Content $limitFile -Raw).Trim() }
$claudeWindow = "session"
$projectsDir = "$env:USERPROFILE\\.claude\\projects"

# Weekly tokens from JSONL (last 7 days)
$weeklyOutputTokens = 0
if (Test-Path $projectsDir) {
    $weeklyCutoff = (Get-Date).AddDays(-7)
    $weeklyFiles = Get-ChildItem -Path $projectsDir -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $weeklyCutoff }
    foreach ($file in $weeklyFiles) {
        $lines = Get-Content $file.FullName -Encoding utf8 -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if (-not $line.Trim()) { continue }
            try {
                $obj = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                $usage = if ($obj.message.usage) { $obj.message.usage } elseif ($obj.usage) { $obj.usage } else { $null }
                if ($usage) { $weeklyOutputTokens += [int]($usage.output_tokens ?? 0) }
            } catch {}
        }
    }
}

# Real Claude.ai session % via Chrome cookies (Python + Windows DPAPI)
$claudeApiPct = $null
$pyScript = @'
import sqlite3, shutil, json, sys, urllib.request, base64, os, ctypes, tempfile
from ctypes import wintypes
from pathlib import Path

class _BLOB(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]

def dpapi_decrypt(data):
    buf = ctypes.create_string_buffer(data, len(data))
    inp = _BLOB(ctypes.sizeof(buf), buf)
    out = _BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inp), None, None, None, None, 0, ctypes.byref(out))
    if not ok: return b''
    res = ctypes.string_at(out.pbData, out.cbData)
    ctypes.windll.kernel32.LocalFree(out.pbData)
    return res

def decrypt_cookie(key, enc):
    try:
        from Crypto.Cipher import AES
        nonce = enc[3:15]
        ct = enc[15:-16]
        tag = enc[-16:]
        return AES.new(key, AES.MODE_GCM, nonce=nonce).decrypt_and_verify(ct, tag).decode('utf-8', errors='ignore')
    except: return ''

appdata = os.environ.get('LOCALAPPDATA', '')
if not appdata: sys.exit(0)

state_path = Path(appdata) / 'Google/Chrome/User Data/Local State'
if not state_path.exists():
    state_path = Path(appdata) / 'BraveSoftware/Brave-Browser/User Data/Local State'
if not state_path.exists(): sys.exit(0)

state = json.loads(state_path.read_text(encoding='utf-8'))
enc_key_b64 = state.get('os_crypt', {}).get('encrypted_key', '')
if not enc_key_b64: sys.exit(0)

key = dpapi_decrypt(base64.b64decode(enc_key_b64)[5:])
if not key: sys.exit(0)

cookies_db = Path(appdata) / 'Google/Chrome/User Data/Default/Cookies'
if not cookies_db.exists():
    cookies_db = Path(appdata) / 'BraveSoftware/Brave-Browser/User Data/Default/Cookies'
if not cookies_db.exists(): sys.exit(0)

tmp = Path(tempfile.gettempdir()) / '_tczcd.db'
shutil.copy2(cookies_db, tmp)
conn = sqlite3.connect(str(tmp))
rows = conn.execute('SELECT name,value,encrypted_value FROM cookies WHERE host_key LIKE ?', ('%claude.ai%',)).fetchall()
conn.close()
try: tmp.unlink()
except: pass

c = {}
for name, val, enc in rows:
    if enc and len(enc) > 3 and enc[:3] == b'v10':
        v = decrypt_cookie(key, enc)
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
    pct = u.get('five_hour', {}).get('utilization')
    pct5 = u.get('five_hour', {}).get('utilization')
    pct7 = u.get('seven_day', {}).get('utilization')
    out = []
    if pct5 is not None: out.append(str(round(float(pct5))))
    if pct7 is not None: out.append(str(round(float(pct7))))
    if out: print(' '.join(out))
except: sys.exit(0)
'@
$tmpPy = "$env:TEMP\\_tczpct.py"
$pyScript | Out-File -FilePath $tmpPy -Encoding utf8
$apiOut = $null
foreach ($pyCmd in @('python3', 'python', 'py')) {
    if (Get-Command $pyCmd -ErrorAction SilentlyContinue) {
        try { $apiOut = (& $pyCmd $tmpPy 2>$null) } catch {}
        break
    }
}
Remove-Item $tmpPy -ErrorAction SilentlyContinue

$claudeUsed = 0
$weeklyPercent = $null
if ($apiOut -match '^(\\d+)(?:\\s+(\\d+))?$') {
    $claudeUsed = [int][math]::Round([int]$Matches[1] * $claudeLimit / 100)
    if ($Matches[2]) { $weeklyPercent = [int]$Matches[2] }
} elseif ($apiOut -match '^\\d+$') {
    $claudeUsed = [int][math]::Round([int]$apiOut * $claudeLimit / 100)
} else {
    # Fallback: latest JSONL session tokens
    if (Test-Path $projectsDir) {
        $latestFile = Get-ChildItem -Path $projectsDir -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($latestFile) {
            $lines = Get-Content $latestFile.FullName -Encoding utf8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if (-not $line.Trim()) { continue }
                try {
                    $obj = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                    $usage = if ($obj.message.usage) { $obj.message.usage } elseif ($obj.usage) { $obj.usage } else { $null }
                    if ($usage) { $claudeUsed += [int]($usage.output_tokens ?? 0) }
                } catch {}
            }
        }
    }
}

$commits = [System.Collections.Generic.List[object]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new()
$gitDirs = Get-ChildItem -Path $WORK_DIR -Recurse -Depth 10 -Filter ".git" -Directory -ErrorAction SilentlyContinue
foreach ($gitDir in $gitDirs) {
    $repoDir = $gitDir.Parent.FullName; $repoName = $gitDir.Parent.Name
    $branch = & git -C $repoDir rev-parse --abbrev-ref HEAD 2>$null
    if (-not $branch) { $branch = "unknown" }
    $authorEmail = & git -C $repoDir config user.email 2>$null
    if (-not $authorEmail) { continue }
    $logLines = & git -C $repoDir log --since="24 hours ago" --author="$authorEmail" --format="%H|%s|%aI" 2>$null
    foreach ($logLine in $logLines) {
        if (-not $logLine) { continue }
        $parts = $logLine -split '\\|', 3
        if ($parts.Count -lt 3) { continue }
        $hash = $parts[0].Trim()
        if ($seen.Contains($hash)) { continue }
        $seen.Add($hash) | Out-Null
        $commits.Add([PSCustomObject]@{ hash=$hash; message=$parts[1].Trim(); branch=$branch; repoName=$repoName; ts=$parts[2].Trim() })
    }
}

$bootTime = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$midnight = (Get-Date).Date
$activeSince = if ($bootTime -gt $midnight) { $bootTime } else { $midnight }
$workMinutes = [int]((Get-Date) - $activeSince).TotalMinutes
$screenLocked = (Get-Process -Name "LogonUI" -ErrorAction SilentlyContinue) -ne $null

$payload = [PSCustomObject]@{
    claudeUsed=$claudeUsed; claudeLimit=$claudeLimit; claudeWindow=$claudeWindow
    weeklyOutputTokens=$weeklyOutputTokens; weeklyPercent=$weeklyPercent
    workMinutes=$workMinutes; commits=$commits; screenOn=(-not $screenLocked)
} | ConvertTo-Json -Depth 5 -Compress

try {
    Invoke-RestMethod -Uri "$SERVER/api/heartbeat" -Method POST -Headers @{ Authorization = "Bearer $TOKEN" } -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
    $msg = "[tezcode $(Get-Date -Format 'HH:mm')] OK — claude:$claudeUsed/$claudeLimit | work:\${workMinutes}min"
    Write-Host $msg; Add-Content -Path $LOG_FILE -Value $msg
} catch {
    $msg = "[tezcode $(Get-Date -Format 'HH:mm')] Xato: $($_.Exception.Message)"
    Write-Host $msg; Add-Content -Path $LOG_FILE -Value $msg
}
`
}
