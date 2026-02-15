/**
 * Run this on your PC to test if your phone can reach the PC.
 * Listens on all interfaces (0.0.0.0) so the phone on the same Wi‑Fi can connect.
 *
 *   node test-server.js
 *
 * Then in the app use: http://YOUR_PC_IP:8082  (e.g. http://192.168.254.108:8082)
 */
const http = require('http');
const PORT = 8082;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, message: 'Connection test OK' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running at http://0.0.0.0:${PORT}`);
  console.log(`On your phone use: http://192.168.254.108:${PORT}`);
  console.log('(Replace with your PC IP from ipconfig if different.)');
});
