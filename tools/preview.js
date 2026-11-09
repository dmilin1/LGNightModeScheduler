'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../app');
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml'};
http.createServer((req,res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  fs.readFile(file,(err,data) => {
    if (err) {res.writeHead(404).end(); return;}
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(8765, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:8765 (simulated TV; no hardware changes)'));
