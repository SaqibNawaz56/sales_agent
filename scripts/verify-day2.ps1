# Verifies Day 2 end to end, from the outside.
#
# Run from a clean shell:
#   powershell -ExecutionPolicy Bypass -File scripts\verify-day2.ps1
#
# Same discipline as Day 1: preconditions abort rather than letting later checks
# report green against a dead stack, and no assertion may pass on absent
# evidence. Allow a few minutes — the extraction suite paces itself to stay
# inside Groq's free-tier token budget.

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

$ps = (docker compose ps --format "{{.Service}}|{{.State}}") | Out-String
if ($ps.Trim() -eq "") { Abort "No containers running. Start them with: docker compose up -d" }
foreach ($svc in @("db", "mcp-server", "api")) {
    if (-not ($ps -match "(?m)^$([regex]::Escape($svc))\|running")) {
        Abort "$svc is not running."
    }
}
Write-Host "  ok    daemon reachable, all three services running" -ForegroundColor DarkGray

# --- 1. The tool surface --------------------------------------------------
Write-Host "`n1. Tool surface: server exposes everything, model is told almost nothing" -ForegroundColor Cyan
$serverTools = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/round-trip.ts 2>&1) | Out-String
$sawList = $serverTools -match "advertised tools:"
Check "MCP server tool list is readable" $sawList

foreach ($tool in @("lookup_product", "create_product", "find_or_create_customer", "save_sale")) {
    Check "server exposes $tool" ($sawList -and $serverTools -match $tool)
}

$advertised = ""
try {
    $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content
} catch { $advertised = "" }
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "model's advertised tool list is readable" $gotList $advertised

# Success criterion 13. Only meaningful once the list has actually loaded.
Check "save_sale is NOT advertised to the model" ($gotList -and $advertised -notmatch "save_sale")
Check "lookup_product is NOT advertised to the model" ($gotList -and $advertised -notmatch "lookup_product")
Check "create_product is NOT advertised to the model" ($gotList -and $advertised -notmatch "create_product")
Check "find_or_create_customer is NOT advertised" ($gotList -and $advertised -notmatch "find_or_create_customer")

# --- 2. Catalogue tools ---------------------------------------------------
Write-Host "`n2. Catalogue tools (lookup_product, create_product)" -ForegroundColor Cyan
$products = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/test-product-tools.ts 2>&1) | Out-String
Check "product tool suite passes" ($products -match "ALL PASSED") ($products -split "`n" | Select-String "FAIL" | Select-Object -First 3)

# --- 3. Customer tool -----------------------------------------------------
Write-Host "`n3. Customer tool (find_or_create_customer)" -ForegroundColor Cyan
$customers = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/test-customer-tools.ts 2>&1) | Out-String
Check "customer tool suite passes" ($customers -match "ALL PASSED") ($customers -split "`n" | Select-String "FAIL" | Select-Object -First 3)

# --- 4. The write path ----------------------------------------------------
Write-Host "`n4. Write path (save_sale) - criteria 8 and 9" -ForegroundColor Cyan
$sales = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/test-save-sale.ts 2>&1) | Out-String
Check "save_sale suite passes" ($sales -match "ALL PASSED") ($sales -split "`n" | Select-String "FAIL" | Select-Object -First 3)
Check "price snapshot survives a catalogue change (criterion 9)" ($sales -match "sale_items still records the price actually charged")
Check "a rejected write leaves nothing behind (criterion 8)" ($sales -match "no orphan line items")

# --- 5. Extraction --------------------------------------------------------
Write-Host "`n5. Extraction - Day 2 'done when'" -ForegroundColor Cyan
Write-Host "     (paced for the Groq token budget, this takes ~1 minute)" -ForegroundColor DarkGray
$extraction = (docker compose exec -T -w /app/packages/api api npx tsx src/scripts/test-extraction.ts 2>&1) | Out-String
$rateLimited = $extraction -match "rate_limit_exceeded"
if ($rateLimited) {
    Write-Host "  WARN  Groq rate limit hit - result is inconclusive, not a regression" -ForegroundColor Yellow
    Write-Host "        wait a minute and re-run" -ForegroundColor DarkGray
    $script:fail++
} else {
    Check "all 10 extraction cases pass" ($extraction -match "10/10 passed") ($extraction -split "`n" | Select-String "FAIL" | Select-Object -First 3)
    Check "multi-item sentence extracts correctly" ($extraction -match "PASS  multi-item sale")
    Check "spelled-out numbers are not misread (R1)" ($extraction -match "PASS  spelled-out number")
    Check "units are not silently converted" ($extraction -match "PASS  mixed - one quantity present")
}

# --- 6. Audit trail -------------------------------------------------------
Write-Host "`n6. Audit trail (criterion 11)" -ForegroundColor Cyan
function Scalar($sql) {
    $raw = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c $sql) | Out-String
    $clean = $raw -replace '\s', ''
    if ($clean -match '^\d+$') { return [int]$clean }
    return $null
}
$logged = Scalar "SELECT count(*) FROM tool_call_logs;"
Check "tool calls are being logged" ($null -ne $logged -and $logged -gt 0) "$logged rows"

$distinct = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c "SELECT DISTINCT tool_name FROM tool_call_logs;") | Out-String
Check "save_sale writes are logged too" ($distinct -match "save_sale") $distinct.Trim().Replace("`n", ", ")
Check "failed calls are logged, not just successes" ((Scalar "SELECT count(*) FROM tool_call_logs WHERE status='error';") -gt 0)

# --- 7. Test isolation ----------------------------------------------------
Write-Host "`n7. The suites clean up after themselves" -ForegroundColor Cyan
Check "catalogue back to 21 seeded products" ((Scalar "SELECT count(*) FROM products;") -eq 21)
Check "no leftover sales" ((Scalar "SELECT count(*) FROM sales;") -eq 0)
Check "no leftover customers" ((Scalar "SELECT count(*) FROM customers;") -eq 0)

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------`n"
if ($script:fail -gt 0) { exit 1 }
