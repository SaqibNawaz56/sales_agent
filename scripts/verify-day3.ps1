# Verifies Day 3 end to end, from the outside.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-day3.ps1
#
# Same discipline as Days 1 and 2: preconditions abort rather than letting later
# checks report green against a dead stack, and no assertion may pass on absent
# evidence. Allow several minutes — the model-backed suites pace themselves to
# stay inside Groq's free-tier token budget.

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

function Scalar($sql) {
    $raw = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c $sql) | Out-String
    $clean = $raw -replace '\s', ''
    if ($clean -match '^\d+$') { return [int]$clean }
    return $null
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

# The catalogue must be the seeded one, or the expected totals below are wrong.
$productCount = Scalar "SELECT count(*) FROM products;"
if ($productCount -ne 21) { Abort "Expected 21 seeded products, found $productCount. Re-run the seed." }
$oilPrice = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c "SELECT current_price FROM products WHERE normalized_name='oil';") | Out-String
if ($oilPrice.Trim() -eq "") { Abort "No product named 'oil' in the catalogue. Re-run the seed." }
Write-Host "  ok    stack running, catalogue seeded (21 products)" -ForegroundColor DarkGray

# Fixture reset. The controller suite needs Ali to exist and leaves them behind.
docker compose exec -T db psql -U shop -d sales_agent -c "DELETE FROM sales; DELETE FROM customers;" | Out-Null

# --- 1. Draft state, with no I/O at all -----------------------------------
Write-Host "`n1. Draft state and session store (no model, no database)" -ForegroundColor Cyan
$state = Api "src/scripts/test-draft-state.ts"
Check "draft state suite passes" ($state -match "ALL PASSED") (($state -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
Check "an incomplete item blocks the grand total" ($state -match "PASS  one incomplete item blocks the whole total")
Check "sessions are isolated from each other" ($state -match "PASS  sessions are isolated")

# --- 2. The checklist -----------------------------------------------------
Write-Host "`n2. Per-item checklist and catalogue resolution" -ForegroundColor Cyan
$checklist = Api "src/scripts/test-checklist.ts"
Check "checklist suite passes" ($checklist -match "ALL PASSED") (($checklist -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
Check "prices come from the catalogue, never the model (R3)" ($checklist -match "PASS  rice price came from the catalogue")
Check "resolution never creates a customer (R2)" ($checklist -match "PASS  customer stays unresolved")

# --- 3. Question generation -----------------------------------------------
Write-Host "`n3. Targeted question generation" -ForegroundColor Cyan
$questions = Api "src/scripts/test-questions.ts"
Check "question suite passes" ($questions -match "ALL PASSED") (($questions -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
Check "questions use the owner's wording" ($questions -match "PASS  uses the owner's word")

# --- 4. The clarification loop --------------------------------------------
Write-Host "`n4. Clarification: parsing and applying a reply" -ForegroundColor Cyan
Write-Host "     (model-backed and paced; ~40s)" -ForegroundColor DarkGray
$clarify = Api "src/scripts/test-clarification.ts"
if ($clarify -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive, not a regression. Wait a minute and re-run." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "clarification suite passes" ($clarify -match "ALL PASSED") (($clarify -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
    Check "answering one item leaves the others untouched (F4)" ($clarify -match "PASS  rice and sugar are untouched")
    Check "an unusable reply does not invent a quantity (R1)" ($clarify -match "PASS  quantity was not invented")
}

# --- 5. The controller ----------------------------------------------------
Write-Host "`n5. Controller turn loop - Day 3 'done when'" -ForegroundColor Cyan
Write-Host "     (model-backed and paced; ~40s)" -ForegroundColor DarkGray
$controller = Api "src/scripts/test-controller.ts"
if ($controller -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive, not a regression. Wait a minute and re-run." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "controller suite passes" ($controller -match "ALL PASSED") (($controller -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
    Check "EXACTLY one question for one missing quantity" ($controller -match "PASS  EXACTLY one question was asked")
    Check "the sale completes after that one answer" ($controller -match "PASS  the sale completes")
    Check "a complete sentence asks nothing at all" ($controller -match "PASS  no question asked")
}

# --- 6. Over the CLI, as the proposal specifies ---------------------------
Write-Host "`n6. The same flow driven through the CLI" -ForegroundColor Cyan
docker compose exec -T db psql -U shop -d sales_agent -c "DELETE FROM sales; DELETE FROM customers;" | Out-Null
$cliInput = "2kg rice, 2kg sugar and oil to Ali`n2 litres`nyes`n/quit"
$cli = ($cliInput | docker compose exec -T -w /app/packages/api api npx tsx src/cli.ts 2>&1) | Out-String

if ($cli -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive. Wait a minute and re-run." -ForegroundColor Yellow
    $script:fail++
} else {
    $howMany = ([regex]::Matches($cli, "How much")).Count
    Check "the CLI asked exactly one question" ($howMany -eq 1) "asked $howMany"
    Check "it asked about the oil specifically" ($cli -match "How much oil")
    Check "rice survived to the summary" ($cli -match "Rice")
    Check "sugar survived to the summary" ($cli -match "Sugar")
    Check "oil was priced from the catalogue" ($cli -match "Oil\s+2 litre")
    Check "the grand total is correct" ($cli -match "1800")
    Check "and it stops at the confirmation gate" ($cli -match "Confirm this sale")
}

# --- 7. Nothing was written -----------------------------------------------
Write-Host "`n7. Day 3 writes no sales (the gate arrives on Day 4)" -ForegroundColor Cyan
Check "no sales rows" ((Scalar "SELECT count(*) FROM sales;") -eq 0)
Check "no sale_items rows" ((Scalar "SELECT count(*) FROM sale_items;") -eq 0)
Check "catalogue untouched" ((Scalar "SELECT count(*) FROM products;") -eq 21)

# --- 8. The Day 2 guarantee still holds -----------------------------------
Write-Host "`n8. Regression: save_sale is still hidden from the model" -ForegroundColor Cyan
$advertised = ""
try { $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content } catch { $advertised = "" }
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "advertised tool list is readable" $gotList $advertised
Check "save_sale is NOT advertised (criterion 13)" ($gotList -and $advertised -notmatch "save_sale")

# Leave the database as we found it.
docker compose exec -T db psql -U shop -d sales_agent -c "DELETE FROM sales; DELETE FROM customers;" | Out-Null

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------`n"
if ($script:fail -gt 0) { exit 1 }
