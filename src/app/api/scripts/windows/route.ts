import { NextResponse } from "next/server"

export async function GET() {
  // In production (standalone), scripts are copied to public folder
  // Fallback to embedded script if file not found
  const script = getScript()
  return new NextResponse(script, {
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

$claudeUsed = 0; $claudeLimit = 500000; $claudeWindow = "5h"
$projectsDir = "$env:USERPROFILE\\.claude\\projects"
if (Test-Path $projectsDir) {
    $cutoff = (Get-Date).AddHours(-5)
    $jsonlFiles = Get-ChildItem -Path $projectsDir -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $cutoff }
    foreach ($file in $jsonlFiles) {
        $lines = Get-Content $file.FullName -Encoding utf8 -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if (-not $line.Trim()) { continue }
            try {
                $obj = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
                $usage = if ($obj.message.usage) { $obj.message.usage } elseif ($obj.usage) { $obj.usage } else { $null }
                if ($usage) { $claudeUsed += [int]($usage.input_tokens ?? 0); $claudeUsed += [int]($usage.output_tokens ?? 0) }
            } catch {}
        }
    }
}

$commits = [System.Collections.Generic.List[object]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new()
$gitDirs = Get-ChildItem -Path $WORK_DIR -Recurse -Depth 4 -Filter ".git" -Directory -ErrorAction SilentlyContinue
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

$bootTime = (Get-Date) - (New-TimeSpan -Seconds (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.Subtract([datetime]::MinValue).TotalSeconds)
$midnight = (Get-Date).Date
$activeSince = if ($bootTime -gt $midnight) { $bootTime } else { $midnight }
$workMinutes = [int]((Get-Date) - $activeSince).TotalMinutes
$screenLocked = (Get-Process -Name "LogonUI" -ErrorAction SilentlyContinue) -ne $null

$payload = [PSCustomObject]@{ claudeUsed=$claudeUsed; claudeLimit=$claudeLimit; claudeWindow=$claudeWindow; workMinutes=$workMinutes; commits=$commits; screenOn=(-not $screenLocked) } | ConvertTo-Json -Depth 5 -Compress

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
