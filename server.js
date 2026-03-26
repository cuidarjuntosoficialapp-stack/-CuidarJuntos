const http = require('http');
const fs = require('fs');
const path = require('path');
const port = 8080;
const dir = __dirname;

const mime = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };

http.createServer((req, res) => {
  let file = req.url === '/' ? '/app.html' : req.url;
  let full = path.join(dir, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(full)] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => {
  console.log('\n✅ Servidor rodando!');
  console.log('📱 Abra no celular (mesma rede Wi-Fi):');
  console.log('   http://192.168.1.102:8080\n');
  console.log('💻 No computador: http://localhost:8080');
  console.log('\nPressione Ctrl+C para parar.\n');
});
