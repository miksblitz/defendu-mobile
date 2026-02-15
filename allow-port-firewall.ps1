# Run this in PowerShell AS ADMINISTRATOR so your phone can connect to Expo over Wi-Fi (LAN).
# Right-click PowerShell -> Run as administrator, then:
#   cd D:\DEFENDU-MOB\defendu-mobile
#   .\allow-port-firewall.ps1
#
# Ports: 8081 = Metro bundler, 19000/19001 = Expo dev server, 8082 = test server

$ports = 8081, 19000, 19001, 8082
foreach ($port in $ports) {
  $name = "Defendu Mobile - Port $port"
  Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any
  Write-Host "Allowed TCP $port (inbound)."
}
Write-Host "Done. Run 'npm start' and connect with Expo Go on your phone (same Wi-Fi)."
