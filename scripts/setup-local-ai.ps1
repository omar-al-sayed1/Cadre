<#
.SYNOPSIS
  Sets up a free, local AI model for Cadre's AI Sales Agent with Ollama.

.DESCRIPTION
  1. Downloads the official Ollama installer with curl, resuming after sleep or
     network drops (suited to slow connections).
  2. Verifies the installer's Authenticode signature before running it.
  3. Installs Ollama silently for the current user.
  4. Pulls the model (retrying until complete) and checks it answers.
  5. Points the Sales Agent at it in .env (SALES_AI_PROVIDER=ollama, SALES_AI_MODEL=...).
     Interviews keep their own engine.

  Progress is logged to %LOCALAPPDATA%\Cadre\local-ai-setup.log.
  Safe to run again: finished steps are skipped.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-local-ai.ps1
  powershell -ExecutionPolicy Bypass -File scripts\setup-local-ai.ps1 -Model qwen2.5:7b-instruct
#>
param(
  [string]$Model = "qwen2.5:3b-instruct",
  [string]$EnvFile = (Join-Path (Split-Path $PSScriptRoot -Parent) ".env")
)

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "Cadre"
$downloads = Join-Path $root "downloads"
$log = Join-Path $root "local-ai-setup.log"
New-Item -ItemType Directory -Force -Path $downloads | Out-Null

function Log([string]$message) {
  $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $message
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Output $line
}

function Find-Ollama {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $default = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path $default) { return $default }
  return $null
}

function Test-OllamaServer {
  try {
    Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 | Out-Null
    return $true
  } catch { return $false }
}

try {
  Log "=== Cadre local AI setup started (model: $Model) ==="

  # 1-3. Install Ollama if missing.
  $ollama = Find-Ollama
  if (-not $ollama) {
    $installer = Join-Path $downloads "OllamaSetup.exe"
    $url = "https://ollama.com/download/OllamaSetup.exe"
    # Expected size from the server (the official URL redirects to a signed GitHub link).
    $headers = & curl.exe -sIL --max-time 60 $url
    $expected = [int64](($headers | Select-String -Pattern "^content-length:\s*(\d+)" -AllMatches |
        ForEach-Object { $_.Matches } | Select-Object -Last 1).Groups[1].Value)
    if ($expected -le 0) { throw "Couldn't read the installer size from ollama.com." }
    Log ("Downloading the Ollama installer ({0:N0} MB); resumes automatically..." -f ($expected / 1MB))
    $lastPct = -1
    while (-not (Test-Path $installer) -or (Get-Item $installer).Length -lt $expected) {
      # Each pass asks ollama.com again (fresh signed link) and continues where it stopped.
      $curl = Start-Process -FilePath "curl.exe" -NoNewWindow -PassThru -ArgumentList @(
        "-L", "--fail", "--silent", "--show-error", "--continue-at", "-",
        "--retry", "5", "--retry-all-errors", "--retry-delay", "15",
        "--speed-limit", "1000", "--speed-time", "120",
        "--output", "`"$installer`"", $url)
      while (-not $curl.HasExited) {
        Start-Sleep -Seconds 30
        if (Test-Path $installer) {
          $pct = [math]::Floor(100 * (Get-Item $installer).Length / $expected)
          if ($pct -ne $lastPct -and $pct % 5 -eq 0) { Log "Installer download: $pct%"; $lastPct = $pct }
        }
      }
      if ((Test-Path $installer) -and (Get-Item $installer).Length -gt $expected) {
        Remove-Item $installer -Force
        Log "Downloaded file was larger than expected; starting over."
      } elseif ((Get-Item $installer -ErrorAction SilentlyContinue).Length -lt $expected) {
        Log "Connection interrupted; continuing in 30 seconds..."
        Start-Sleep -Seconds 30
      }
    }
    Log "Installer downloaded."

    $signature = Get-AuthenticodeSignature -FilePath $installer
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Ollama") {
      throw "The installer's signature is not a valid Ollama signature ($($signature.Status): $($signature.SignerCertificate.Subject)). Not running it."
    }
    Log "Signature verified: $($signature.SignerCertificate.Subject)"

    Log "Installing Ollama..."
    $process = Start-Process -FilePath $installer -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)." }
    $ollama = Find-Ollama
    if (-not $ollama) { throw "Ollama was installed but ollama.exe wasn't found." }
    Log "Ollama installed at $ollama"
  } else {
    Log "Ollama is already installed at $ollama"
  }

  # Make sure the local server is running.
  if (-not (Test-OllamaServer)) {
    Log "Starting the Ollama server..."
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
    for ($i = 0; $i -lt 30 -and -not (Test-OllamaServer); $i++) { Start-Sleep -Seconds 2 }
    if (-not (Test-OllamaServer)) { throw "The Ollama server didn't start." }
  }

  # 4. Pull the model (ollama resumes partial downloads; retry on network errors).
  $pulled = $false
  for ($attempt = 1; $attempt -le 200 -and -not $pulled; $attempt++) {
    Log "Downloading model $Model (attempt $attempt)..."
    # ollama writes progress to stderr; don't let that count as a PowerShell error.
    $ErrorActionPreference = "Continue"
    $output = & $ollama pull $Model 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    $output | Select-Object -Last 2 | ForEach-Object { Log "  $_" }
    if ($code -eq 0) { $pulled = $true } else { Start-Sleep -Seconds 30 }
  }
  if (-not $pulled) { throw "The model download didn't finish." }
  Log "Model $Model is ready."

  $body = @{
    model = $Model
    messages = @(@{ role = "user"; content = 'Reply with the JSON object {"ok": true} only.' })
    format = "json"
    stream = $false
  } | ConvertTo-Json -Depth 5
  $reply = Invoke-RestMethod -Uri "http://localhost:11434/api/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 300
  Log "Model test reply: $($reply.message.content)"

  # 5. Point the Sales Agent at the local model.
  if (Test-Path $EnvFile) {
    $lines = @(Get-Content -Path $EnvFile -Encoding utf8 | Where-Object { $_ -notmatch "^(SALES_AI_PROVIDER|SALES_AI_MODEL)=" })
    $lines += "SALES_AI_PROVIDER=ollama"
    $lines += "SALES_AI_MODEL=$Model"
    # UTF-8 without a byte-order mark (Windows PowerShell's utf8 adds one).
    [System.IO.File]::WriteAllLines($EnvFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))
    Log "Updated $EnvFile - restart Cadre (pnpm dev) to use the local model."
  } else {
    Log "No .env found at $EnvFile - add SALES_AI_PROVIDER=ollama and SALES_AI_MODEL=$Model yourself."
  }
  Log "=== DONE ==="
} catch {
  Log "FAILED: $($_.Exception.Message)"
  Log "Run the script again to continue from where it stopped."
  exit 1
}
