# HouseCall Pro — Create Estimate from CSV
#
# Usage:
#   .\hcp-create-estimate.ps1 -CsvPath "C:\path\to\estimate.csv"
#
# CSV format (single file, 4 rows minimum):
#   Row 1: CustomerName,ContactFirst,ContactLast,Email,Phone,Street,Street2,City,State,Zip,Message
#   Row 2: <customer data>
#   Row 3: kind,Item Name,Description,Quantity,Price
#   Row 4+: <line items>
#
#   kind    = "service" or "part"
#   Price   = dollars (e.g. 1700.00) — script converts to cents automatically
#   Street2 = can be blank but column must be present
#
# API key: J:\My Drive\OLD FILES\Secrets\LAKEFRONT_HCP.env

param(
  [Parameter(Mandatory)][string]$CsvPath
)

$key = "f433056534a6498596e65520bd62ddf5"
$headers = @{ "Authorization" = "Token $key"; "Content-Type" = "application/json" }

# ─── READ CSV ────────────────────────────────────────────────────────────────
$lines = Get-Content -Path $CsvPath

# Row 1 = customer headers, Row 2 = customer data
$customerHeaders = $lines[0] -split ','
$customerValues  = $lines[1] | ConvertFrom-Csv -Header $customerHeaders | Select-Object -First 1

$customerName  = $customerValues.CustomerName
$contactFirst  = $customerValues.ContactFirst
$contactLast   = $customerValues.ContactLast
$email         = $customerValues.Email
$phone         = $customerValues.Phone -replace '\D',''
$street        = $customerValues.Street
$street2       = $customerValues.Street2
$city          = $customerValues.City
$state         = $customerValues.State
$zip           = $customerValues.Zip
$message       = $customerValues.Message

# Row 3+ = line items
$lineItemsCsv = $lines[2..($lines.Count - 1)] | ConvertFrom-Csv

$lineItems = $lineItemsCsv | ForEach-Object {
  @{
    name        = $_.'Item Name'
    description = $_.Description
    quantity    = [int]$_.Quantity
    unit_price  = [int]([double]$_.Price * 100)
    kind        = $_.kind
  }
}

Write-Host "Customer : $customerName ($contactFirst $contactLast)"
Write-Host "Address  : $street $street2, $city $state $zip"
Write-Host "Items    : $($lineItems.Count)"
Write-Host "Total    : `$$( ($lineItems | Measure-Object -Property unit_price -Sum).Sum / 100 )"
Write-Host ""

# ─── CREATE CUSTOMER ─────────────────────────────────────────────────────────
$customerBody = @{
  first_name            = $contactFirst
  last_name             = $contactLast
  company               = $customerName
  email                 = $email
  mobile_number         = $phone
  kind                  = "business"
  notifications_enabled = $false
  addresses             = @(@{
    type          = "service"
    street        = $street
    street_line_2 = $street2
    city          = $city
    state         = $state
    zip           = $zip
  })
} | ConvertTo-Json -Depth 3

try {
  $c = Invoke-RestMethod -Uri "https://api.housecallpro.com/customers" -Headers $headers -Method POST -Body $customerBody
  $customerId = $c.id
  $addressId  = $c.addresses[0].id
  Write-Host "Customer created: $customerId"
} catch {
  Write-Host "ERROR creating customer: $($_.ErrorDetails.Message)"
  exit 1
}

# ─── CREATE ESTIMATE ─────────────────────────────────────────────────────────
$estimateBody = @{
  customer_id = $customerId
  address_id  = $addressId
  options     = @(@{
    name             = "Option #1"
    message_from_pro = $message
    line_items       = $lineItems
  })
} | ConvertTo-Json -Depth 6

try {
  $r = Invoke-RestMethod -Uri "https://api.housecallpro.com/estimates" -Headers $headers -Method POST -Body $estimateBody
  Write-Host "SUCCESS — Estimate #$($r.estimate_number) created"
  Write-Host "Total   : `$$($r.options[0].total_amount / 100)"
  Write-Host "ID      : $($r.id)"
} catch {
  Write-Host "ERROR creating estimate: $($_.ErrorDetails.Message)"
  exit 1
}
