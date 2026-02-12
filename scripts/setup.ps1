Write-Host "Setting up Jarvis project..." -ForegroundColor Cyan

if (!(Test-Path "./data")) {
  New-Item -Path "./data" -ItemType Directory | Out-Null
}

if (!(Test-Path "./plugins")) {
  New-Item -Path "./plugins" -ItemType Directory | Out-Null
}

npm install

Write-Host "Setup complete. Run: npm run dev" -ForegroundColor Green
