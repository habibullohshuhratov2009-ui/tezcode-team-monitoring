# Tezcode Monitor — Claude token + git commits + work hours (Windows)
# Setup:
#   "ttm_live_YOUR_TOKEN" | Out-File "$env:USERPROFILE\.tezcode_token" -Encoding utf8
#   .\tezcode-monitor.ps1 -Install    ← Task Scheduler'ga qo'shadi (har 15 daqiqa)
#   .\tezcode-monitor.ps1             ← bir marta ishlatish

param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"

$SERVER   = if ($env:TEZCODE_SERVER) { $env:TEZCODE_SERVER } else { "https://tezcode-team-monitoring-production.up.railway.app" }
$WORK_DIR = if ($env:TEZCODE_WORK_DIR) { $env:TEZCODE_WORK_DIR } else { $env:USERPROFILE }
$LOG_FILE = "$env:USERPROFILE\.tezcode_monitor.log"

# ── Install mode: register Task Scheduler ────────────────────────────────────
if ($Install) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
                 -Argument "-NonInteractive -WindowStyle Hidden -File `"$scriptPath`""
    $trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 15) `
                 -Once -At (Get-Date)
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
                  -StartWhenAvailable
    Register-ScheduledTask -TaskName "TezcodeMonitor" -Action $action `
      -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
    Write-Host "[tezcode] Task Scheduler ga qo'shildi. Har 15 daqiqada ishga tushadi."
    exit 0
}

# ── Load token ────────────────────────────────────────────────────────────────
$TOKEN = $env:TEZCODE_TOKEN
if (-not $TOKEN) {
    $tokenFile = "$env:USERPROFILE\.tezcode_token"
    if (Test-Path $tokenFile) {
        $TOKEN = (Get-Content $tokenFile -Raw).Trim()
    }
}
if (-not $TOKEN) {
    Write-Host "[tezcode] Xato: token topilmadi. $env:USERPROFILE\.tezcode_token faylini yarating."
    exit 1
}

# ── 1. Claude token usage (last 5 hours) ─────────────────────────────────────
$claudeUsed  = 0
$claudeLimit = 500000
$claudeWindow = "5h"

$projectsDir = "$env:USERPROFILE\.claude\projects"
if (Test-Path $projectsDir) {
    $cutoff = (Get-Date).AddHours(-5)
    $jsonlFiles = Get-ChildItem -Path $projectsDir -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue `
                  | Where-Object { $_.LastWriteTime -gt $cutoff }

    foreach ($file in $jsonlFiles) {
        $lines = Get-Content $file.FullName -Encoding utf8 -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if (-not $line.Trim()) { continue }
            try {
                $obj = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                $usage = if ($obj.message.usage) { $obj.message.usage } elseif ($obj.usage) { $obj.usage } else { $null }
                if ($usage) {
                    $claudeUsed += [int]($usage.input_tokens  ?? 0)
                    $claudeUsed += [int]($usage.output_tokens ?? 0)
                }
            } catch {}
        }
    }
}

# ── 2. Git commits (last 24 hours across all repos) ──────────────────────────
$commits = [System.Collections.Generic.List[object]]::new()
$seen    = [System.Collections.Generic.HashSet[string]]::new()

$gitDirs = Get-ChildItem -Path $WORK_DIR -Recurse -Depth 4 -Filter ".git" `
           -Directory -ErrorAction SilentlyContinue

foreach ($gitDir in $gitDirs) {
    $repoDir  = $gitDir.Parent.FullName
    $repoName = $gitDir.Parent.Name

    $branch = & git -C $repoDir rev-parse --abbrev-ref HEAD 2>$null
    if (-not $branch) { $branch = "unknown" }

    $authorEmail = & git -C $repoDir config user.email 2>$null
    if (-not $authorEmail) { continue }

    $logLines = & git -C $repoDir log `
        --since="24 hours ago" `
        --author="$authorEmail" `
        --format="%H|%s|%aI" 2>$null

    foreach ($logLine in $logLines) {
        if (-not $logLine) { continue }
        $parts = $logLine -split '\|', 3
        if ($parts.Count -lt 3) { continue }
        $hash = $parts[0].Trim()
        if ($seen.Contains($hash)) { continue }
        $seen.Add($hash) | Out-Null
        $commits.Add([PSCustomObject]@{
            hash     = $hash
            message  = $parts[1].Trim()
            branch   = $branch
            repoName = $repoName
            ts       = $parts[2].Trim()
        })
    }
}

# ── 3. Work minutes (since boot or midnight, whichever is later) ──────────────
$bootTime   = (Get-Date) - (New-TimeSpan -Seconds (Get-CimInstance Win32_OperatingSystem).SystemUptime ?? 0)
$midnight   = (Get-Date).Date
$activeSince = if ($bootTime -gt $midnight) { $bootTime } else { $midnight }
$workMinutes = [int]((Get-Date) - $activeSince).TotalMinutes

# ── 4. Send to server ─────────────────────────────────────────────────────────
$payload = [PSCustomObject]@{
    claudeUsed   = $claudeUsed
    claudeLimit  = $claudeLimit
    claudeWindow = $claudeWindow
    workMinutes  = $workMinutes
    commits      = $commits
} | ConvertTo-Json -Depth 5 -Compress

try {
    $response = Invoke-RestMethod -Uri "$SERVER/api/heartbeat" `
        -Method POST `
        -Headers @{ Authorization = "Bearer $TOKEN" } `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))

    $msg = "[tezcode $(Get-Date -Format 'HH:mm')] OK — claude:$claudeUsed/$claudeLimit | commits:$($commits.Count) | work:${workMinutes}min"
    Write-Host $msg
    Add-Content -Path $LOG_FILE -Value $msg
} catch {
    $msg = "[tezcode $(Get-Date -Format 'HH:mm')] Xato: $($_.Exception.Message)"
    Write-Host $msg
    Add-Content -Path $LOG_FILE -Value $msg
}
