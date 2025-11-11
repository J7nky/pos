# Upload Update Files to Server
# This script copies update files to the public/updates folder for Netlify deployment

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Souq POS - Update File Upload Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Define paths
$distPath = "dist"
$publicUpdatesPath = "public\updates"
$version = "0.0.6"

# Files to upload
$files = @(
    "latest.yml",
    "Souq POS Setup $version.exe",
    "Souq POS Setup $version.exe.blockmap"
)

# Check if dist folder exists
if (-not (Test-Path $distPath)) {
    Write-Host "❌ Error: dist folder not found!" -ForegroundColor Red
    Write-Host "   Please run 'npm run dist' first to build the application." -ForegroundColor Yellow
    exit 1
}

# Create public/updates folder if it doesn't exist
if (-not (Test-Path $publicUpdatesPath)) {
    Write-Host "📁 Creating public/updates folder..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $publicUpdatesPath -Force | Out-Null
    Write-Host "✅ Folder created" -ForegroundColor Green
}

Write-Host "📋 Checking files in dist folder..." -ForegroundColor Cyan
Write-Host ""

# Check and copy each file
$allFilesExist = $true
foreach ($file in $files) {
    $sourcePath = Join-Path $distPath $file
    
    if (Test-Path $sourcePath) {
        $fileSize = (Get-Item $sourcePath).Length
        $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
        
        Write-Host "✅ Found: $file" -ForegroundColor Green
        Write-Host "   Size: $fileSizeMB MB" -ForegroundColor Gray
        
        # Copy file
        $destPath = Join-Path $publicUpdatesPath $file
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Host "   Copied to: $destPath" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Missing: $file" -ForegroundColor Red
        Write-Host "   Expected at: $sourcePath" -ForegroundColor Gray
        Write-Host ""
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "❌ Some files are missing!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please rebuild the application:" -ForegroundColor Yellow
    Write-Host "  npm run dist" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ All files copied successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Show next steps
Write-Host "📤 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Commit the files to git:" -ForegroundColor White
Write-Host "   git add public/updates/" -ForegroundColor Gray
Write-Host "   git commit -m `"Add update files for version $version`"" -ForegroundColor Gray
Write-Host "   git push" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Netlify will automatically deploy to:" -ForegroundColor White
Write-Host "   https://souq-trablous.com/updates/" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Verify the files are accessible:" -ForegroundColor White
Write-Host "   https://souq-trablous.com/updates/latest.yml" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ask if user wants to commit now
$response = Read-Host "Would you like to commit and push now? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    Write-Host ""
    Write-Host "📝 Adding files to git..." -ForegroundColor Yellow
    git add public/updates/
    
    Write-Host "💾 Committing..." -ForegroundColor Yellow
    git commit -m "Add update files for version $version"
    
    Write-Host "📤 Pushing to remote..." -ForegroundColor Yellow
    git push
    
    Write-Host ""
    Write-Host "✅ Done! Check Netlify for deployment status." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ℹ️  Remember to commit and push manually when ready!" -ForegroundColor Yellow
}
