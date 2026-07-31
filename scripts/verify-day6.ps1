# Verifies Day 6 from the outside.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-day6.ps1
#
# SCOPE, STATED HONESTLY. This checks everything up to the DOM: the app builds
# and type-checks, the container serves it, the Vite proxy reaches the API, and
# both button paths behave correctly against the real database. It does NOT
# drive a browser, so it cannot prove a human can click Confirm. That last step
# is the manual checklist printed at the end, and Day 6's "done when" is not met
# until someone has run it.

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

# Through the Vite dev server, exactly as the browser would.
function ViaProxy($path, $body) {
    try {
        return Invoke-RestMethod -Uri "http://localhost:5173$path" -Method Post `
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
foreach ($svc in @("db", "mcp-server", "api", "web")) {
    if (-not ($ps -match "(?m)^$([regex]::Escape($svc))\|running")) { Abort "$svc is not running." }
}
Write-Host "  ok    all four services running" -ForegroundColor DarkGray
Sql "DELETE FROM sales; DELETE FROM customers;"

# --- 1. The app is served -------------------------------------------------
Write-Host "`n1. The frontend is served from its own container" -ForegroundColor Cyan
$page = $null
try { $page = Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing -TimeoutSec 20 } catch {}
if ($null -eq $page) { Abort "Nothing is answering on http://localhost:5173." }

Check "responds 200" ($page.StatusCode -eq 200)
Check "serves the React mount point" ($page.Content -match 'id="root"')
Check "loads the app entry point" ($page.Content -match "main\.tsx")

# --- 2. It compiles -------------------------------------------------------
Write-Host "`n2. TypeScript compiles and the app builds" -ForegroundColor Cyan
$build = (docker compose exec -T -w /app/packages/web web npm run build 2>&1) | Out-String
Check "tsc --noEmit and vite build both succeed" ($build -match "built in")
Check "emits a JS bundle" ($build -match "assets/index-.*\.js")
Check "emits a stylesheet" ($build -match "assets/index-.*\.css")

# --- 3. The proxy ---------------------------------------------------------
Write-Host "`n3. The browser origin reaches the API through the Vite proxy" -ForegroundColor Cyan
$r1 = ViaProxy "/api/chat" @{ sessionId = "v6"; message = "2kg rice and 2kg sugar to Ali" }
if ($null -eq $r1) { Abort "POST through the proxy failed. Nothing below would be meaningful." }
Check "a chat turn round-trips through :5173" ($null -ne $r1.reply) $r1.reply

Start-Sleep -Seconds 4
$r2 = ViaProxy "/api/chat" @{ sessionId = "v6"; message = "yes" }
Check "the sale reaches the gate" ($r2.awaitingConfirmation -eq $true)

# --- 4. The card has everything it needs to render ------------------------
Write-Host "`n4. draftSale carries what the confirmation card renders" -ForegroundColor Cyan
Check "draftSale is present" ($null -ne $r2.draftSale)
Check "customer name for the heading" ($r2.draftSale.customer -eq "Ali") $r2.draftSale.customer
Check "one row per item" ($r2.draftSale.items.Count -eq 2)
Check "each row has a product name" (($r2.draftSale.items | Where-Object { $_.product }).Count -eq 2)
Check "each row has a line total" (($r2.draftSale.items | Where-Object { $null -ne $_.lineTotal }).Count -eq 2)
Check "a grand total for the footer" ($r2.draftSale.grandTotal -eq 800) $r2.draftSale.grandTotal
Check "status marks it as held" ($r2.draftSale.status -eq "awaiting_confirmation")
Check "nothing written while the card is on screen" ((Scalar "SELECT count(*) FROM sales;") -eq 0)

# --- 5. The two buttons ---------------------------------------------------
Write-Host "`n5. The Confirm and Cancel buttons" -ForegroundColor Cyan
$confirmed = ViaProxy "/api/sales/confirm" @{ sessionId = "v6"; confirmed = $true }
Check "Confirm saves" ($confirmed.saved -eq $true) $confirmed.reply
Check "one sale row exists" ((Scalar "SELECT count(*) FROM sales;") -eq 1)
Check "with the total shown on the card" ((Scalar "SELECT total_amount FROM sales;") -eq 800)

$before = Scalar "SELECT count(*) FROM sales;"
Start-Sleep -Seconds 4
ViaProxy "/api/chat" @{ sessionId = "v6b"; message = "3kg flour to Ali" } | Out-Null
$cancelled = ViaProxy "/api/sales/confirm" @{ sessionId = "v6b"; confirmed = $false }
Check "Cancel discards" ($cancelled.reply -match "Nothing was saved") $cancelled.reply
Check "and writes nothing" ((Scalar "SELECT count(*) FROM sales;") -eq $before) "before $before"

# --- 6. The client's reach is limited -------------------------------------
Write-Host "`n6. What the client is able to call" -ForegroundColor Cyan
$clientSource = Get-Content "packages/web/src/api.ts" -Raw
$endpoints = [regex]::Matches($clientSource, '"(/api/[a-z/]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Check "the client calls exactly two endpoints" ($endpoints.Count -eq 2) ($endpoints -join ", ")
Check "and one of them is the chat endpoint" ($endpoints -contains "/api/chat")
Check "and the other is the confirm endpoint" ($endpoints -contains "/api/sales/confirm")

$webSource = (Get-ChildItem "packages/web/src" -Recurse -File | Get-Content -Raw) -join "`n"
Check "the browser bundle never mentions save_sale" ($webSource -notmatch "save_sale")
Check "the card does not recompute the total itself" ((Get-Content "packages/web/src/ConfirmationCard.tsx" -Raw) -notmatch "reduce\(")

# --- 7. Regression --------------------------------------------------------
Write-Host "`n7. Regression: the tool boundary is unchanged" -ForegroundColor Cyan
$advertised = ""
try { $advertised = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing -TimeoutSec 15).Content } catch { $advertised = "" }
$gotList = ($advertised -match '"tools"\s*:\s*\[')
Check "advertised tool list is readable" $gotList $advertised
Check "save_sale is still NOT advertised (criterion 13)" ($gotList -and $advertised -notmatch "save_sale")

Sql "DELETE FROM sales; DELETE FROM customers;"

Write-Host "`n----------------------------------------"
$colour = "Green"
if ($script:fail -gt 0) { $colour = "Red" }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $colour
Write-Host "----------------------------------------"

Write-Host @"

  NOT PROVEN BY THIS SCRIPT
  Day 6's criterion is that the flow is completable IN THE BROWSER. No browser
  was driven here. Open http://localhost:5173 and confirm by hand:

    1. Type:  2kg rice, 2kg sugar and oil to Ali
    2. It asks how much oil          -> answer: 2 litres
    3. It asks about the customer    -> answer: yes
    4. A table appears with 3 rows and a total of 1800
    5. Click Confirm                 -> "Saved. Sale #N"
    6. Reload the page               -> the session survives; ask
                                        "what did I sell today?"
    7. Start another sale and click Cancel -> "Nothing was saved"

"@ -ForegroundColor Cyan

if ($script:fail -gt 0) { exit 1 }
