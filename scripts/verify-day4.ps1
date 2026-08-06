# Verifies Day 4 end to end, from the outside.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-day4.ps1
#
# Day 4's "done when" has two halves, and both are checked at row level:
#   1. a complete sale INCLUDING a brand-new product is written correctly
#   2. a rejected sale leaves the sales tables untouched
#
# Allow several minutes. Model-backed suites pace themselves to stay inside
# Groq's free-tier token budget.

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

function Api($relativeScript) {
    return (docker compose exec -T -w /app/packages/api api npx tsx $relativeScript 2>&1) | Out-String
}

function Sql($statement) {
    docker compose exec -T db psql -U shop -d sales_agent -c $statement | Out-Null
}

function Scalar($sql) {
    $raw = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c $sql) | Out-String
    $clean = $raw -replace '\s', ''
    if ($clean -match '^-?[\d.]+$') { return [decimal]$clean }
    return $null
}

# NOT named "Cli": PowerShell resolves aliases before functions, and `cli` is
# the built-in alias for Clear-Item. A function by that name is silently never
# called.
function RunCli($lines) {
    $output = ($lines | docker compose exec -T -w /app/packages/api api npx tsx src/cli/main.ts 2>&1) | Out-String
    if ($output -notmatch "Sales agent") {
        # Without this guard, every "nothing was written" assertion below would
        # pass simply because the CLI never ran.
        Abort "The CLI produced no usable output. Raw: $($output.Trim())"
    }
    return $output
}

# --- Preconditions --------------------------------------------------------
Write-Host "`n0. Preconditions" -ForegroundColor Cyan
$null = docker info 2>$null
if ($LASTEXITCODE -ne 0) { Abort "Docker daemon is not reachable. Start Docker Desktop." }

$ps = (docker compose ps --format "{{.Service}}|{{.State}}") | Out-String
if ($ps.Trim() -eq "") { Abort "No containers running. Start them with: docker compose up -d" }
foreach ($svc in @("db", "mcp-server", "api")) {
    if (-not ($ps -match "(?m)^$([regex]::Escape($svc))\|running")) { Abort "$svc is not running." }
}

# A clean slate. Ghee must be absent for the sub-loop to be exercised at all.
Sql "DELETE FROM sales; DELETE FROM customers; DELETE FROM products WHERE normalized_name IN ('ghee','masala','saffron');"

$productCount = Scalar "SELECT count(*) FROM products;"
if ($productCount -ne 20) { Abort "Expected 20 seeded products, found $productCount. Re-run the seed." }
Write-Host "  ok    stack running, catalogue seeded, ghee absent" -ForegroundColor DarkGray

# --- 1. The new-product sub-loop ------------------------------------------
Write-Host "`n1. New-product sub-loop (F5)" -ForegroundColor Cyan
Write-Host "     (model-backed and paced; ~1 minute)" -ForegroundColor DarkGray
$subloop = Api "src/scripts/test-new-product.ts"
if ($subloop -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive, not a regression." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "sub-loop suite passes" ($subloop -match "ALL PASSED") (($subloop -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
    Check "an unknown product pauses without losing the rest" ($subloop -match "PASS  rice is still in the draft")
    Check "the price given earlier is not lost when asking the unit" ($subloop -match "PASS  the price given earlier was not lost")
    Check "declining drops the item instead of stalling" ($subloop -match "PASS  the sale still completes")
}

# --- 2. The gate and the write path ---------------------------------------
Write-Host "`n2. Confirmation gate and write path" -ForegroundColor Cyan
Sql "DELETE FROM sales; DELETE FROM customers;"
$gate = Api "src/scripts/test-confirm-gate.ts"
if ($gate -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive, not a regression." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "gate suite passes" ($gate -match "ALL PASSED") (($gate -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
    Check "a held sale is not replaced by a new message" ($gate -match "PASS  the original items are intact")
    Check "an unfinished sale cannot be confirmed" ($gate -match "PASS  the write is refused")
    Check "confirming twice does not write twice" ($gate -match "PASS  the second confirm is refused")
}

# --- 3. Done-when, half one: a sale with a NEW product, written -----------
Write-Host "`n3. Done-when (1/2): a sale including a brand-new product" -ForegroundColor Cyan
Sql "DELETE FROM sales; DELETE FROM customers; DELETE FROM products WHERE normalized_name='ghee';"

$flow = "2kg rice and 1kg ghee to Ali`nyes`n1200`nyes`n/confirm`n/quit"
$cli = RunCli $flow

if ($cli -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "the sub-loop was entered" ($cli -match "isn't in your catalogue")
    Check "the owner was asked for a price" ($cli -match "What's the price of ghee")
    Check "the product was added" ($cli -match "Added Ghee at 1200")
    Check "the sale resumed with rice intact" ($cli -match "Rice")
    Check "the total is 600 + 1200" ($cli -match "1800")
    Check "and it was saved" ($cli -match "Saved. Sale #")

    # Row level, not just transcript.
    Check "exactly one sale row exists" ((Scalar "SELECT count(*) FROM sales;") -eq 1)
    Check "with two line items" ((Scalar "SELECT count(*) FROM sale_items;") -eq 2)
    Check "grand total stored as 1800" ((Scalar "SELECT total_amount FROM sales;") -eq 1800)
    Check "ghee is now in the catalogue" ((Scalar "SELECT count(*) FROM products WHERE normalized_name='ghee';") -eq 1)
    Check "at the price the owner supplied" ((Scalar "SELECT current_price FROM products WHERE normalized_name='ghee';") -eq 1200)
    Check "the customer was created once" ((Scalar "SELECT count(*) FROM customers;") -eq 1)
    Check "the ghee line snapshotted 1200" ((Scalar "SELECT unit_price_snapshot FROM sale_items si JOIN products p ON p.id=si.product_id WHERE p.normalized_name='ghee';") -eq 1200)
}

# --- 4. Done-when, half two: rejection writes nothing ---------------------
Write-Host "`n4. Done-when (2/2): a rejected sale leaves the sales tables untouched" -ForegroundColor Cyan
$salesBefore = Scalar "SELECT count(*) FROM sales;"
$itemsBefore = Scalar "SELECT count(*) FROM sale_items;"

$rejectFlow = "3kg flour and 2kg sugar to Ali`n/cancel`n/quit"
$rejected = RunCli $rejectFlow

if ($rejected -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "the sale reached the gate" ($rejected -match "Confirm this sale")
    Check "and was discarded" ($rejected -match "Nothing was saved")
    Check "no new sale row" ((Scalar "SELECT count(*) FROM sales;") -eq $salesBefore) "before $salesBefore"
    Check "no new sale_items rows" ((Scalar "SELECT count(*) FROM sale_items;") -eq $itemsBefore) "before $itemsBefore"
}

# --- 5. Criterion 13, both halves -----------------------------------------
Write-Host "`n5. save_sale is unreachable by the agent (criterion 13)" -ForegroundColor Cyan
$advertised = ""
try { $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content } catch { $advertised = "" }
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "advertised tool list is readable" $gotList $advertised
Check "save_sale is absent from it" ($gotList -and $advertised -notmatch "save_sale")

# The other half: exactly one call site in the source.
$callSites = (Select-String -Path "packages/api/src/*.ts" -Pattern 'save_sale' | Where-Object { $_.Line -notmatch '^\s*(\*|//)' })
$callSiteCount = ($callSites | Measure-Object).Count
Check "save_sale appears in exactly one place in the controller" ($callSiteCount -eq 1) (($callSites | ForEach-Object { "$($_.Filename):$($_.LineNumber)" }) -join ", ")
Check "and that place is controller.ts" ($callSites.Filename -eq "controller.ts")

# --- 6. The audit trail caught the write ----------------------------------
Write-Host "`n6. Audit trail (criterion 11)" -ForegroundColor Cyan
Check "save_sale writes are logged" ((Scalar "SELECT count(*) FROM tool_call_logs WHERE tool_name='save_sale';") -gt 0)
Check "create_product calls are logged" ((Scalar "SELECT count(*) FROM tool_call_logs WHERE tool_name='create_product';") -gt 0)

# Leave the database as we found it.
Sql "DELETE FROM sales; DELETE FROM customers; DELETE FROM products WHERE normalized_name IN ('ghee','masala','saffron');"

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------`n"
if ($script:fail -gt 0) { exit 1 }
