# Opens the OpenExam Hub growth tracker in the default browser.
# Starts a tiny local server if needed. Not a desktop app - browser only.
# Set OEH_TRACKER_START=ideas to open the Ideas cockpit instead of Backlinks.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = if ($env:OEH_TRACKER_PORT) { [int]$env:OEH_TRACKER_PORT } else { 5179 }
$Start = if ($env:OEH_TRACKER_START) { $env:OEH_TRACKER_START.ToLowerInvariant() } else { 'backlinks' }
$Page = if ($Start -eq 'ideas') { 'ideas.html' } else { 'tracker.html' }
$Url = "http://127.0.0.1:$Port/$Page"
$Health = "http://127.0.0.1:$Port/api/health"
$ServeScript = Join-Path $Root 'serve-tracker.mjs'

function Test-TrackerUp {
  try {
    $r = Invoke-WebRequest -Uri $Health -UseBasicParsing -TimeoutSec 1
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

if (-not (Test-TrackerUp)) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Start-Process 'https://nodejs.org/'
    exit 1
  }

  Start-Process -FilePath $node.Source -ArgumentList $ServeScript -WorkingDirectory $Root -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(12)
  while (-not (Test-TrackerUp)) {
    if ((Get-Date) -gt $deadline) { break }
    Start-Sleep -Milliseconds 250
  }
}

Start-Process $Url
