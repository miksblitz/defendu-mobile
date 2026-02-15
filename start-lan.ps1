# Start Expo using your PC's Wi-Fi IP so your phone can connect (same Wi-Fi).
# Use this when "npm start" fails even with firewall off.
# Run: .\start-lan.ps1

# Get your PC's Wi-Fi IPv4 (192.168.x.x or 10.x.x.x), skip virtual adapters
$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^192\.168\.|^10\.' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Docker|WSL' }
$ip = ($addrs | Select-Object -First 1).IPAddress

if (-not $ip) {
  Write-Host "Could not detect Wi-Fi IP. Run 'ipconfig' and find IPv4 for your Wi-Fi (e.g. 192.168.1.5)."
  Write-Host "Then run:  $env:REACT_NATIVE_PACKAGER_HOSTNAME='YOUR_IP'; npx expo start"
  exit 1
}

Write-Host "Using LAN IP: $ip (connect phone to same Wi-Fi and scan QR code)"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip
npx expo start
