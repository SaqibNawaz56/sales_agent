# Verifies Day 5 end to end, from the outside.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-day5.ps1
#
# Day 5's "done when": all three questions answer correctly through the HTTP
# API. Success criterion 15 is checked by inspecting the actual outbound payload
# rather than by trusting that tokenisation was applied.
#
# Allow several minutes. Model-backed steps pace themselves for Groq's free tier.

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

function Sql($statement) {
    docker compose exec -T db psql -U shop -d sales_agent -c $statement | Out-Null
}

function Scalar($sql) {
    $raw = (docker compose exec -T db psql -U shop -d sales_agent -t -A -c $sql) | Out-String
    $clean = $raw -replace '\s', ''
    if ($clean -match '^-?[\d.]+$') { return [decimal]$clean }
    return $null
}

# Not named Post: avoids any chance of an alias collision, the way `Cli`
# silently resolved to Clear-Item in verify-day4.
function SendJson($path, $body) {
    try {
        return Invoke-RestMethod -Uri "http://localhost:3000$path" -Method Post `
            -ContentType "application/json" -Body ($body | ConvertTo-Json) -TimeoutSec 90
    } catch {
        return $null
    }
}

# --- Preconditions --------------------------------------------------------
Write-Host "`n0. Preconditions" -ForegroundColor Cyan
$null = docker info 2>$null
if ($LASTEXITCODE -ne 0) { Abort "Docker daemon is not reachable. Start Docker Desktop." }

$ps = (docker compose ps --format "{{.Service}}|{{.State}}") | Out-String
foreach ($svc in @("db", "mcp-server", "api")) {
    if (-not ($ps -match "(?m)^$([regex]::Escape($svc))\|running")) { Abort "$svc is not running." }
}

$health = $null
try { $health = Invoke-RestMethod -Uri "http://localhost:3000/healthz" -TimeoutSec 15 } catch {}
if ($null -eq $health) { Abort "The API is not answering on http://localhost:3000." }

Sql "DELETE FROM sales; DELETE FROM customers;"
$productCount = Scalar "SELECT count(*) FROM products;"
if ($productCount -lt 20) { Abort "Expected the seeded catalogue, found $productCount products." }
Write-Host "  ok    stack running, API reachable, sales tables empty" -ForegroundColor DarkGray

# --- 1. The three query tools ---------------------------------------------
Write-Host "`n1. Query tools against real data (criterion 10)" -ForegroundColor Cyan
$tools = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/test-query-tools.ts 2>&1) | Out-String
Check "query tool suite passes" ($tools -match "ALL PASSED") (($tools -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
Check "revenue uses snapshots, not current price (F7)" ($tools -match "PASS  revenue is unchanged after a price rise")
Check "an unknown customer returns zeroes, not an error" ($tools -match "PASS  unknown customer reports found:false")

# --- 2. Pseudonymisation and routing --------------------------------------
Write-Host "`n2. Pseudonymisation and routing (criterion 15)" -ForegroundColor Cyan
Write-Host "     (model-backed and paced; ~1 minute)" -ForegroundColor DarkGray
Sql "DELETE FROM sales; DELETE FROM customers;"
$path = (docker compose exec -T -w /app/packages/api api npx tsx src/scripts/test-query-path.ts 2>&1) | Out-String
if ($path -match "rate_limit_exceeded") {
    Write-Host "  WARN  Groq rate limit hit - inconclusive, not a regression." -ForegroundColor Yellow
    $script:fail++
} else {
    Check "query path suite passes" ($path -match "ALL PASSED") (($path -split "`n" | Select-String "FAIL" | Select-Object -First 3) -join " ")
    Check "the outbound payload carries NO real customer name" ($path -match "PASS  and contains NO real customer name")
    Check "the model routes on a token" ($path -match "PASS  the model routed on the token")
    Check "the owner still sees the real name" ($path -match "PASS  but the answer shown to the owner has the real name back")
    Check "longer names are tokenised first" ($path -match "PASS  longer names win")
}

# --- 3. A sale through the HTTP API ---------------------------------------
Write-Host "`n3. Logging a sale through POST /api/chat and /api/sales/confirm" -ForegroundColor Cyan
Sql "DELETE FROM sales; DELETE FROM customers;"

$r1 = SendJson "/api/chat" @{ sessionId = "v5"; message = "2kg rice and 2kg sugar to Ali" }
if ($null -eq $r1) { Abort "POST /api/chat did not respond. Nothing below would be meaningful." }
Check "the API answered" ($null -ne $r1.reply) $r1.reply

$r2 = SendJson "/api/chat" @{ sessionId = "v5"; message = "yes" }
Check "the sale reaches the gate" ($r2.awaitingConfirmation -eq $true) $r2.reply
Check "draftSale is attached for the client to render" ($null -ne $r2.draftSale)
Check "with an itemised breakdown" ($r2.draftSale.items.Count -eq 2) $r2.draftSale.items.Count
Check "and a grand total of 800" ($r2.draftSale.grandTotal -eq 800) $r2.draftSale.grandTotal
Check "nothing written yet" ((Scalar "SELECT count(*) FROM sales;") -eq 0)

$r3 = SendJson "/api/sales/confirm" @{ sessionId = "v5"; confirmed = $true }
Check "confirm reports saved" ($r3.saved -eq $true) $r3.reply
Check "exactly one sale row now exists" ((Scalar "SELECT count(*) FROM sales;") -eq 1)
Check "with the right total" ((Scalar "SELECT total_amount FROM sales;") -eq 800)

# --- 4. Done-when: all three questions over HTTP --------------------------
Write-Host "`n4. Done-when: all three questions through the HTTP API" -ForegroundColor Cyan
Start-Sleep -Seconds 4
$q1 = SendJson "/api/chat" @{ sessionId = "v5q"; message = "what did I sell today?" }
Check "daily total answers with the real figure" ($q1.reply -match "800") $q1.reply

Start-Sleep -Seconds 4
$q2 = SendJson "/api/chat" @{ sessionId = "v5q"; message = "how much has Ali bought?" }
Check "sales by customer names Ali" ($q2.reply -match "Ali") $q2.reply
Check "and reports 800" ($q2.reply -match "800") $q2.reply

Start-Sleep -Seconds 4
$q3 = SendJson "/api/chat" @{ sessionId = "v5q"; message = "how much rice have I sold?" }
Check "sales by product names Rice" ($q3.reply -match "(?i)rice") $q3.reply
Check "and reports the 600 of rice" ($q3.reply -match "600") $q3.reply

# --- 5. Graceful failure --------------------------------------------------
Write-Host "`n5. No results and unrecognised questions (R4)" -ForegroundColor Cyan
Start-Sleep -Seconds 4
$vague = SendJson "/api/chat" @{ sessionId = "v5q"; message = "how is business going?" }
Check "a vague question is not improvised on" ($vague.reply -match "I can answer three things") $vague.reply

Start-Sleep -Seconds 4
$none = SendJson "/api/chat" @{ sessionId = "v5q"; message = "how much shampoo have I sold?" }
Check "no results is stated plainly" ($none.reply -match "(?i)haven't sold any") $none.reply

# --- 6. The confirm endpoint refuses to guess -----------------------------
Write-Host "`n6. POST /api/sales/confirm validation" -ForegroundColor Cyan
$noFlag = $null
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/sales/confirm" -Method Post `
        -ContentType "application/json" -Body (@{ sessionId = "v5" } | ConvertTo-Json) -TimeoutSec 20
} catch {
    $noFlag = $_.Exception.Response.StatusCode.value__
}
Check "a missing 'confirmed' flag is rejected, not defaulted" ($noFlag -eq 400) "status $noFlag"

$noSession = $null
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/chat" -Method Post `
        -ContentType "application/json" -Body (@{ message = "hello" } | ConvertTo-Json) -TimeoutSec 20
} catch {
    $noSession = $_.Exception.Response.StatusCode.value__
}
Check "a missing sessionId is rejected" ($noSession -eq 400) "status $noSession"

# --- 7. Rejection still writes nothing ------------------------------------
Write-Host "`n7. Rejection through the API writes nothing" -ForegroundColor Cyan
$before = Scalar "SELECT count(*) FROM sales;"
Start-Sleep -Seconds 4
SendJson "/api/chat" @{ sessionId = "v5r"; message = "3kg flour to Ali" } | Out-Null
$rejected = SendJson "/api/sales/confirm" @{ sessionId = "v5r"; confirmed = $false }
Check "the draft was discarded" ($rejected.reply -match "Nothing was saved") $rejected.reply
Check "no new sale row" ((Scalar "SELECT count(*) FROM sales;") -eq $before) "before $before"

# --- 8. The Day 2-4 guarantees still hold ---------------------------------
Write-Host "`n8. Regression: the tool boundary is unchanged" -ForegroundColor Cyan
$advertised = ""
try { $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content } catch { $advertised = "" }
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "advertised tool list is readable" $gotList $advertised
Check "save_sale is still NOT advertised (criterion 13)" ($gotList -and $advertised -notmatch "save_sale")
Check "list_customers is NOT advertised either" ($gotList -and $advertised -notmatch "list_customers")

$serverTools = (docker compose exec -T -w /app/packages/mcp-server mcp-server npx tsx src/scripts/round-trip.ts 2>&1) | Out-String
foreach ($tool in @("query_daily_total", "query_sales_by_customer", "query_sales_by_product")) {
    Check "server exposes $tool" ($serverTools -match $tool)
}

Sql "DELETE FROM sales; DELETE FROM customers;"

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------`n"
if ($script:fail -gt 0) { exit 1 }
