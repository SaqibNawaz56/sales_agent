# The scripted end-to-end demo.
#
#   powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
#
# Runs start to finish without intervention. Every figure shown comes from the
# live system — nothing here is pre-recorded.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$SESSION = "demo-$(Get-Random -Maximum 99999)"

function Narrate($text) {
    Write-Host "`n$text" -ForegroundColor Cyan
}

function Owner($text) {
    Write-Host "`n  owner >  " -NoNewline -ForegroundColor Yellow
    Write-Host $text -ForegroundColor Yellow
}

function Agent($text) {
    foreach ($line in ($text -split "`n")) {
        Write-Host "  agent |  $line" -ForegroundColor White
    }
}

function Say($message) {
    Owner $message
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/chat" -Method Post `
        -ContentType "application/json" `
        -Body (@{ sessionId = $SESSION; message = $message } | ConvertTo-Json) -TimeoutSec 120
    Agent $response.reply
    Start-Sleep -Milliseconds 1200
    return $response
}

function Resolve($confirmed) {
    Owner $(if ($confirmed) { "[clicks Confirm]" } else { "[clicks Cancel]" })
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/sales/confirm" -Method Post `
        -ContentType "application/json" `
        -Body (@{ sessionId = $SESSION; confirmed = $confirmed } | ConvertTo-Json) -TimeoutSec 120
    Agent $response.reply
    Start-Sleep -Milliseconds 1200
    return $response
}

function Sql($statement) {
    docker compose exec -T db psql -U shop -d sales_agent -c $statement
}

# --- Preflight ------------------------------------------------------------
Write-Host "`n=================================================================" -ForegroundColor DarkGray
Write-Host "  Conversational Sales-Logging Agent - end to end" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor DarkGray

$null = docker info 2>$null
if ($LASTEXITCODE -ne 0) { throw "Docker is not running." }
$null = Invoke-RestMethod -Uri "http://localhost:3000/healthz" -TimeoutSec 15

# Clean slate so the numbers below are the demo's own.
docker compose exec -T db psql -U shop -d sales_agent `
    -c "DELETE FROM sales; DELETE FROM customers; DELETE FROM products WHERE normalized_name='ghee';" | Out-Null

Narrate "1. A messy multi-item sentence. Note: no quantity for the oil, and ghee is not in the catalogue."
Say "2kg rice, 2kg sugar, 1kg ghee and oil to Ali" | Out-Null

Narrate "2. Ghee is unknown. The sale pauses on that one item - it does not restart."
Say "yes" | Out-Null

Narrate "3. The owner supplies the price. This is the ONLY way a price enters the system."
Say "1200" | Out-Null

Narrate "4. Now the missing quantity. One targeted question, about one item."
Say "2 litres" | Out-Null

Narrate "5. Ali is new. Creating a customer is always an explicit, confirmed action."
$summary = Say "yes"

Narrate "6. The itemised summary. Nothing has been written yet - check the database:"
Sql "SELECT count(*) AS sales_rows FROM sales;"

Narrate "7. The owner confirms. This is the only path that reaches save_sale."
Resolve $true | Out-Null

Narrate "8. What was actually written:"
Sql "SELECT s.id, c.name AS customer, s.total_amount FROM sales s JOIN customers c ON c.id = s.customer_id;"
Sql "SELECT p.name AS product, si.quantity, si.unit_price_snapshot, si.line_total FROM sale_items si JOIN products p ON p.id = si.product_id ORDER BY si.id;"

Narrate "9. A second sale, rejected. The gate is not decoration."
$SESSION = "$SESSION-b"
Say "3kg flour to Ali" | Out-Null
Resolve $false | Out-Null
Sql "SELECT count(*) AS sales_rows_still FROM sales;"

Narrate "10. Now the read side. Three fixed tools, no generated SQL."
$SESSION = "$SESSION-q"
Say "what did I sell today?" | Out-Null
Say "how much has Ali bought?" | Out-Null
Say "how much rice have I sold?" | Out-Null

Narrate "11. A question the system cannot answer. It says so rather than improvising."
Say "how is business going?" | Out-Null

Narrate "12. Price snapshotting. Raise the price of rice and re-ask:"
Sql "UPDATE products SET current_price = 400 WHERE normalized_name = 'rice';"
Say "how much rice have I sold?" | Out-Null
Write-Host "  (revenue is unchanged - the line item kept the price actually charged)" -ForegroundColor DarkGray
Sql "UPDATE products SET current_price = 300 WHERE normalized_name = 'rice';"

Narrate "13. The audit trail. Every tool call, including the controller's own write:"
Sql "SELECT tool_name, status, count(*) FROM tool_call_logs GROUP BY tool_name, status ORDER BY tool_name;"

Narrate "14. And what the model was ever told it could do:"
$tools = (Invoke-WebRequest -Uri "http://localhost:3000/api/tools" -UseBasicParsing).Content
Write-Host "  advertised to the LLM : $tools" -ForegroundColor White
Write-Host "  on the MCP server     : health_check, lookup_product, create_product," -ForegroundColor White
Write-Host "                          find_or_create_customer, list_customers, save_sale," -ForegroundColor White
Write-Host "                          query_daily_total, query_sales_by_customer," -ForegroundColor White
Write-Host "                          query_sales_by_product" -ForegroundColor White
Write-Host "`n  save_sale exists, is logged, and was called - but the model was never" -ForegroundColor Green
Write-Host "  told it exists, so it could not have called it." -ForegroundColor Green

Write-Host "`n=================================================================" -ForegroundColor DarkGray
Write-Host "  Demo complete." -ForegroundColor White
Write-Host "=================================================================`n" -ForegroundColor DarkGray
