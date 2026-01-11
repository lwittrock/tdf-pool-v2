# TdF Pool - Local Testing Script
# Run this in PowerShell (VS Code terminal)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TdF Pool - Local API Testing Script" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$BASE_URL = "http://localhost:3000"
$API_BASE = "$BASE_URL/api/admin"

# Function to test API endpoint
function Test-ApiEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow
    Write-Host "URL: $Url" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            ContentType = "application/json"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            Write-Host "Body: $($params.Body)" -ForegroundColor Gray
        }
        
        $response = Invoke-RestMethod @params
        Write-Host "SUCCESS" -ForegroundColor Green
        Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor White
        Write-Host ""
        return $true
    }
    catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        Write-Host ""
        return $false
    }
}

# Check if dev server is running
Write-Host "Checking if dev server is running..." -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri $BASE_URL -TimeoutSec 2 -UseBasicParsing
    Write-Host "Dev server is running!" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "Dev server is NOT running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start your dev server first:" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor Cyan
    Write-Host "  or" -ForegroundColor Yellow
    Write-Host "  yarn dev" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Menu
while ($true) {
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "Select a test to run:" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Get Riders List" -ForegroundColor White
    Write-Host "2. Get Stages List" -ForegroundColor White
    Write-Host "3. Get Stage Details (Stage 1)" -ForegroundColor White
    Write-Host "4. Update Active Selections (Stage 1)" -ForegroundColor White
    Write-Host "5. Calculate Points (Stage 1)" -ForegroundColor White
    Write-Host "6. Process Stage (Stage 1)" -ForegroundColor White
    Write-Host "7. Run Full Stage Processing (Steps 4-6)" -ForegroundColor Yellow
    Write-Host "8. Test Manual Stage Entry (Example Data)" -ForegroundColor Magenta
    Write-Host "9. View Database Stats SQL" -ForegroundColor Cyan
    Write-Host "0. Exit" -ForegroundColor Red
    Write-Host ""
    
    $choice = Read-Host "Enter choice (0-9)"
    Write-Host ""
    
    switch ($choice) {
        "1" {
            Test-ApiEndpoint -Name "Get Riders List" `
                -Url "$API_BASE/riders-list" `
                -Method "GET"
        }
        
        "2" {
            Test-ApiEndpoint -Name "Get Stages List" `
                -Url "$API_BASE/stages-list" `
                -Method "GET"
        }
        
        "3" {
            Test-ApiEndpoint -Name "Get Stage 1 Details" `
                -Url "$API_BASE/stage?stage_number=1" `
                -Method "GET"
        }
        
        "4" {
            $body = @{
                stage_number = 1
            }
            Test-ApiEndpoint -Name "Update Active Selections (Stage 1)" `
                -Url "$API_BASE/update-active-selections" `
                -Method "POST" `
                -Body $body
        }
        
        "5" {
            $body = @{
                stage_number = 1
                force = $false
            }
            Test-ApiEndpoint -Name "Calculate Points (Stage 1)" `
                -Url "$API_BASE/calculate-points" `
                -Method "POST" `
                -Body $body
        }
        
        "6" {
            $body = @{
                stage_number = 1
                force = $false
            }
            Test-ApiEndpoint -Name "Process Stage (Stage 1)" `
                -Url "$API_BASE/process-stage" `
                -Method "POST" `
                -Body $body
        }
        
        "7" {
            Write-Host "Running FULL Stage Processing..." -ForegroundColor Yellow
            Write-Host ""
            
            # Step 1: Update Active Selections
            $body1 = @{ stage_number = 1 }
            $result1 = Test-ApiEndpoint -Name "Step 1: Update Active Selections" `
                -Url "$API_BASE/update-active-selections" `
                -Method "POST" `
                -Body $body1
            
            if (-not $result1) {
                Write-Host "Step 1 failed. Stopping." -ForegroundColor Red
                continue
            }
            
            Start-Sleep -Seconds 2
            
            # Step 2: Calculate Points
            $body2 = @{ stage_number = 1; force = $false }
            $result2 = Test-ApiEndpoint -Name "Step 2: Calculate Points" `
                -Url "$API_BASE/calculate-points" `
                -Method "POST" `
                -Body $body2
            
            if (-not $result2) {
                Write-Host "Step 2 failed. Stopping." -ForegroundColor Red
                continue
            }
            
            Start-Sleep -Seconds 2
            
            # Step 3: Process Stage (this will also mark as complete)
            $body3 = @{ stage_number = 1; force = $false }
            $result3 = Test-ApiEndpoint -Name "Step 3: Process Stage & Generate JSONs" `
                -Url "$API_BASE/process-stage" `
                -Method "POST" `
                -Body $body3
            
            if ($result3) {
                Write-Host "==================================================" -ForegroundColor Green
                Write-Host "  FULL STAGE PROCESSING COMPLETE!" -ForegroundColor Green
                Write-Host "==================================================" -ForegroundColor Green
                Write-Host ""
            }
        }
        
        "8" {
            Write-Host "Testing Manual Stage Entry..." -ForegroundColor Magenta
            Write-Host "This will create/update Stage 1 with example data" -ForegroundColor Yellow
            Write-Host ""
            
            $confirm = Read-Host "Continue? (y/n)"
            if ($confirm -ne "y") {
                Write-Host "Cancelled." -ForegroundColor Yellow
                continue
            }
            
            # Example stage entry data
            $body = @{
                stage_number = 1
                date = "2025-07-05"
                distance = "185 km"
                departure_city = "Florence"
                arrival_city = "Rimini"
                stage_type = "Flat"
                difficulty = "Easy"
                won_how = "Sprint"
                top_20_finishers = @(
                    @{ rider_name = "Rider A"; position = 1; time_gap = "0:00" }
                    @{ rider_name = "Rider B"; position = 2; time_gap = "+0:01" }
                    @{ rider_name = "Rider C"; position = 3; time_gap = "+0:01" }
                    @{ rider_name = "Rider D"; position = 4; time_gap = "+0:01" }
                    @{ rider_name = "Rider E"; position = 5; time_gap = "+0:02" }
                    @{ rider_name = "Rider F"; position = 6; time_gap = "+0:02" }
                    @{ rider_name = "Rider G"; position = 7; time_gap = "+0:02" }
                    @{ rider_name = "Rider H"; position = 8; time_gap = "+0:03" }
                    @{ rider_name = "Rider I"; position = 9; time_gap = "+0:03" }
                    @{ rider_name = "Rider J"; position = 10; time_gap = "+0:03" }
                    @{ rider_name = "Rider K"; position = 11; time_gap = "+0:04" }
                    @{ rider_name = "Rider L"; position = 12; time_gap = "+0:04" }
                    @{ rider_name = "Rider M"; position = 13; time_gap = "+0:05" }
                    @{ rider_name = "Rider N"; position = 14; time_gap = "+0:05" }
                    @{ rider_name = "Rider O"; position = 15; time_gap = "+0:06" }
                    @{ rider_name = "Rider P"; position = 16; time_gap = "+0:06" }
                    @{ rider_name = "Rider Q"; position = 17; time_gap = "+0:07" }
                    @{ rider_name = "Rider R"; position = 18; time_gap = "+0:07" }
                    @{ rider_name = "Rider S"; position = 19; time_gap = "+0:08" }
                    @{ rider_name = "Rider T"; position = 20; time_gap = "+0:08" }
                )
                jerseys = @{
                    yellow = "Rider A"
                    green = "Rider A"
                    polka_dot = "Rider B"
                    white = "Rider C"
                }
                combativity = "Rider D"
                dnf_riders = @()
                dns_riders = @()
                force = $true
            }
            
            Test-ApiEndpoint -Name "Manual Stage Entry (Example)" `
                -Url "$API_BASE/manual-entry" `
                -Method "POST" `
                -Body $body
            
            Write-Host "NOTE: Replace rider names with actual names from your database!" -ForegroundColor Yellow
            Write-Host ""
        }
        
        "9" {
            Write-Host "Opening Database Stats Query..." -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Copy this SQL and run in Supabase SQL Editor:" -ForegroundColor Yellow
            Write-Host ""
            
            $sqlQuery = @'
-- Database Stats After Processing

-- 1. Rider Stage Points
SELECT 'Rider Stage Points' as table_name, COUNT(*) as row_count
FROM rider_stage_points;

-- 2. Participant Stage Points
SELECT 'Participant Stage Points' as table_name, COUNT(*) as row_count
FROM participant_stage_points;

-- 3. Participant Rider Contributions
SELECT 'Participant Rider Contributions' as table_name, COUNT(*) as row_count
FROM participant_rider_contributions;

-- 4. Active Selections
SELECT 'Active Selections (is_active=true)' as status, COUNT(*) as count
FROM participant_rider_selections
WHERE is_active = true
UNION ALL
SELECT 'Inactive Selections (is_active=false)', COUNT(*)
FROM participant_rider_selections
WHERE is_active = false;

-- 5. Top 10 Riders by Points (Stage 1)
SELECT r.name, rsp.total_points, rsp.stage_rank
FROM rider_stage_points rsp
JOIN riders r ON rsp.rider_id = r.id
JOIN stages s ON rsp.stage_id = s.id
WHERE s.stage_number = 1
ORDER BY rsp.stage_rank
LIMIT 10;

-- 6. Top 10 Participants by Points (Stage 1)
SELECT p.name, psp.stage_points, psp.stage_rank
FROM participant_stage_points psp
JOIN participants p ON psp.participant_id = p.id
JOIN stages s ON psp.stage_id = s.id
WHERE s.stage_number = 1
ORDER BY psp.stage_rank
LIMIT 10;
'@
            
            Write-Host $sqlQuery -ForegroundColor Cyan
            Write-Host ""
        }
        
        "0" {
            Write-Host "Exiting..." -ForegroundColor Yellow
            exit 0
        }
        
        default {
            Write-Host "Invalid choice. Please select 0-9." -ForegroundColor Red
            Write-Host ""
        }
    }
    
    Write-Host "Press Enter to continue..." -ForegroundColor Gray
    Read-Host
    Clear-Host
}