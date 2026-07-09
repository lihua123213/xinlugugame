const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 8080;
const DIR = __dirname;

// HTTP server - serve static files
let cachedMap = null;
const server = http.createServer((req, res) => {
  if(req.url==='/api/map'){
    if(req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{JSON.parse(body);cachedMap=body;}catch(e){}res.writeHead(200);res.end('ok');});return;}
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(cachedMap||'null');return;
  }
  let filePath = req.url === '/' ? '/farm-game.html' : req.url;
  filePath = path.join(DIR, filePath);
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocketServer({ server });
let host = null;
let client = null;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const role = url.searchParams.get('role');

  if (role === 'host') {
    if (host) { ws.close(); return; }
    host = ws;
    console.log('Host connected');
    if (client && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'host_ready' }));
      host.send(JSON.stringify({ type: 'client_ready' }));
    }
    ws.on('message', (data) => {
      const str = data.toString();
      if(str.startsWith('{"type":"map"')){cachedMap=str;}
      else if (client && client.readyState === 1) client.send(str);
    });
    ws.on('close', () => {
      if(host===ws){host = null; cachedMap=null;}
      console.log('Host disconnected');
      if (client && client.readyState === 1) client.send(JSON.stringify({ type: 'host_disconnected' }));
    });
  } else if (role === 'client') {
    if (client && client.readyState === 1) { client.close(); }
    client = ws;
    var clientId = Date.now();
    ws._clientId = clientId;
    console.log('Client connected #' + clientId);
    if (host && host.readyState === 1) {
      host.send(JSON.stringify({ type: 'client_ready' }));
      client.send(JSON.stringify({ type: 'host_ready' }));
    }
    ws.on('message', (data) => {
      if (host && host.readyState === 1) host.send(data.toString());
    });
    ws.on('close', () => {
      if(client && client._clientId === clientId){
        client = null;
        console.log('Client disconnected #' + clientId);
        if (host && host.readyState === 1) host.send(JSON.stringify({ type: 'client_disconnected' }));
      } else {
        console.log('Old client closed (replaced) #' + clientId);
      }
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { lanIP = net.address; break; }
    }
  }
  console.log(`Server running at:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  LAN:     http://${lanIP}:${PORT}`);
  console.log(`  P2 join: http://${lanIP}:${PORT}/client.html`);
});
