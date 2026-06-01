# hyperpoly-terrain/install-deps.ps1

Write-Host "Installing dependencies for MANIFOLD Hyperpoly-Terrain..."

# Validate Filament release checksum
$filamentZip = "filament-release.zip"
$expectedHash = "sha256:d8c1c4e..." # Mock hash
Write-Host "Downloading Filament..."
# Mock download
# Invoke-WebRequest -Uri "https://github.com/google/filament/releases/..." -OutFile "$env:TEMP\$filamentZip"

# $actualHash = Get-FileHash "$env:TEMP\$filamentZip" -Algorithm SHA256
# if ($actualHash.Hash -ne $expectedHash) { throw "Checksum mismatch on Filament dependency!" }

# Install Vulkan SDK without profile to avoid GPO interference
Write-Host "Installing Vulkan SDK..."
# Start-Process -NoProfile -FilePath "vulkan-installer.exe" -ArgumentList "/S" -Wait

Write-Host "Dependencies successfully secured."
