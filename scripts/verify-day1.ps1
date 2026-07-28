# Verifies Day 1 end to end, from the outside.
#
# Every check runs against the running containers, never against source, so the
# result does not depend on trusting whoever wrote the code. Run from a clean
# shell:  powershell -ExecutionPolicy Bypass -File scripts\verify-day1.ps1
#
# Design rule: every check must PASS only on positive evidence. A check that
# passes because a response was empty, or because everything is broken, is a
# false negative dressed as success — so preconditions abort the run instead of
# letting later checks report green against a dead stack.

$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$script:pass = 0
$script:fail = 0

function Check($name, $condition, $detail) {
    if ($condition -eq $true) {
        Write-Host "  PASS  $name" -ForegroundColor Green
        if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
        $script:pass++
    } else {
        Write-Host "  FAIL  $name" -ForegroundColor Red
        if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
        $script:fail++
    }
}

function Abort($message) {
    Write-Host "`n  ABORTED: $message" -ForegroundColor Yellow
    Write-Host "  Nothing was verified. Fix this first, then re-run.`n" -ForegroundColor Yellow
    exit 2
}

# --- Preconditions --------------------------------------------------------
Write-Host "`n0. Preconditions" -ForegroundColor Cyan
$null = docker info 2>$null
if ($LASTEXITCODE -ne 0) { Abort "Docker daemon is not reachable. Start Docker Desktop." }
Write-Host "  ok    docker daemon reachable" -ForegroundColor DarkGray

$ps = (docker compose ps --format "{{.Service}}|{{.State}}") | Out-String
if ($LASTEXITCODE -ne 0) { Abort "'docker compose ps' failed. Are you in the project root?" }
if ($ps.Trim() -eq "") { Abort "No containers are running. Start them with: docker compose up -d" }
Write-Host "  ok    compose project responding" -ForegroundColor DarkGray

# --- 1. Containerisation --------------------------------------------------
Write-Host "`n1. All three services run as containers" -ForegroundColor Cyan
foreach ($svc in @("db", "mcp-server", "api")) {
    $running = $ps -match "(?m)^$([regex]::Escape($svc))\|running"
    Check "$svc is running" $running
}

# --- 2. Data lives in the containerised Postgres --------------------------
Write-Host "`n2. The database is the containerised one, not local PostgreSQL" -ForegroundColor Cyan
$vol = (docker volume ls --format "{{.Name}}" | Where-Object { $_ -like "*pgdata*" }) | Out-String
Check "docker volume holds the data" ($vol.Trim() -ne "") $vol.Trim()

function Scalar($sql) {
    $raw = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c $sql) | Out-String
    $clean = $raw -replace '\s', ''
    if ($clean -match '^\d+$') { return [int]$clean }
    return $null
}

$tableCount = Scalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
Check "all 5 tables + migrations exist" ($null -ne $tableCount -and $tableCount -ge 6) "$tableCount tables in public schema"

$productCount = Scalar "SELECT count(*) FROM products;"
Check "catalogue is seeded" ($null -ne $productCount -and $productCount -ge 20) "$productCount products"

# Port 5433 is deliberate: local PostgreSQL 18 owns 5432, so a mapping on 5433
# is evidence the container, not the host service, is the one in play.
$portMap = (docker compose port db 5432) | Out-String
Check "db is published on host port 5433" ($portMap -match ":5433") $portMap.Trim()

# --- 3. MCP over HTTP, separate process -----------------------------------
Write-Host "`n3. The MCP server answers over HTTP, from a separate process" -ForegroundColor Cyan
$rt = (docker compose run --rm -w /app/packages/mcp-server mcp-server npm run round-trip 2>&1) | Out-String
Check "raw MCP client completes a round-trip" ($rt -match "round-trip OK") "separate container -> http://mcp-server:3001/mcp"
Check "tool returned the real product count" ($null -ne $productCount -and $rt -match "\D$productCount\D")

# --- 4. Day 1 'done when' -------------------------------------------------
Write-Host "`n4. The model invokes an MCP tool end to end (Day 1 'done when')" -ForegroundColor Cyan
$agent = (docker compose run --rm -w /app/packages/api api npm run prove-agent 2>&1) | Out-String
$agentOk = $agent -match "agent -> MCP round-trip OK"
Check "ChatGroq called the MCP tool" $agentOk
Check "reply contains the real catalogue count" ($null -ne $productCount -and $agent -match "\D$productCount\D")

# --- 5. Allowlist discipline ----------------------------------------------
Write-Host "`n5. Only allowlisted tools reach the model" -ForegroundColor Cyan
$advertised = ""
try {
    $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content
} catch {
    $advertised = ""
}
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "advertised tool list is reachable" $gotList $advertised
# Only meaningful if the list actually loaded — otherwise "absent" proves nothing.
Check "save_sale is NOT advertised" ($gotList -and $advertised -notmatch "save_sale")

# --- 6. Negative test -----------------------------------------------------
Write-Host "`n6. Negative test: the agent genuinely depends on the MCP container" -ForegroundColor Cyan
if (-not $agentOk) {
    Write-Host "  SKIP  negative test (positive case never passed, so it would prove nothing)" -ForegroundColor Yellow
} else {
    Write-Host "     stopping mcp-server..." -ForegroundColor DarkGray
    docker compose stop mcp-server | Out-Null
    # --no-deps is essential: `docker compose run` honours depends_on and would
    # silently restart mcp-server, making this test pass against a live server.
    $broken = (docker compose run --rm --no-deps -w /app/packages/api api npm run prove-agent 2>&1) | Out-String
    $failedForRightReason = ($broken -notmatch "agent -> MCP round-trip OK") -and ($broken -match "(?i)fetch|ECONNREFUSED|connect|socket|network")
    Check "agent fails, and fails on the MCP connection" $failedForRightReason "proves the tool is not running in-process"

    Write-Host "     restarting mcp-server..." -ForegroundColor DarkGray
    docker compose start mcp-server | Out-Null
    Start-Sleep -Seconds 10
    $recovered = (docker compose run --rm -w /app/packages/api api npm run prove-agent 2>&1) | Out-String
    Check "agent recovers once mcp-server is back" ($recovered -match "agent -> MCP round-trip OK")
}

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------`n"
if ($script:fail -gt 0) { exit 1 }
