/**
 * FlashBooth — Signaling Server (v8 — Railway ready)
 * Deploy ke Railway: railway up
 * Akses: https://flashbooth-xxx.railway.app
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  // Health check untuk Railway
  if (req.url === '/healthz') {
    res.writeHead(200); res.end('ok'); return;
  }

  let fp = req.url.split('?')[0];
  if (fp === '/' || fp === '') fp = '/filmbooth.html';
  fp = path.join(__dirname, fp);

  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    const mime = {
      '.html': 'text/html;charset=utf-8',
      '.js':   'text/javascript',
      '.css':  'text/css',
    }[path.extname(fp)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

// rooms[roomId] = { desktop: ws|null, phone: ws|null }
const rooms = {};

const wss = new WebSocketServer({ server, verifyClient: () => true });
wss.on('connection', ws => {
  ws._room = null;
  ws._role = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, room } = msg;

    if (type === 'desktop-join') {
      ws._room = room; ws._role = 'desktop';
      rooms[room] = rooms[room] || { desktop: null, phone: null };
      rooms[room].desktop = ws;
      console.log(`[${room}] desktop joined`);
      if (rooms[room].phone?.readyState === 1)
        ws.send(JSON.stringify({ type: 'cam-ready' }));
    }

    else if (type === 'phone-join') {
      ws._room = room; ws._role = 'phone';
      if (!rooms[room] || !rooms[room].desktop) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room tidak ditemukan. Buka ulang dari desktop.' }));
        return;
      }
      rooms[room].phone = ws;
      console.log(`[${room}] phone joined`);
      ws.send(JSON.stringify({ type: 'ready' }));
    }

    else if (type === 'cam-ready') {
      const desk = rooms[room]?.desktop;
      if (desk?.readyState === 1) desk.send(JSON.stringify({ type: 'cam-ready' }));
    }

    else if (type === 'offer') {
      const phone = rooms[room]?.phone;
      if (phone?.readyState === 1) phone.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
    }

    else if (type === 'answer') {
      const desk = rooms[room]?.desktop;
      if (desk?.readyState === 1) desk.send(JSON.stringify({ type: 'answer', sdp: msg.sdp }));
    }

    else if (type === 'ice-desktop') {
      const phone = rooms[room]?.phone;
      if (phone?.readyState === 1) phone.send(JSON.stringify({ type: 'ice-desktop', ice: msg.ice }));
    }

    else if (type === 'ice-phone') {
      const desk = rooms[room]?.desktop;
      if (desk?.readyState === 1) desk.send(JSON.stringify({ type: 'ice-phone', ice: msg.ice }));
    }
  });

  ws.on('close', () => {
    const { _room, _role } = ws;
    if (!_room || !rooms[_room]) return;
    console.log(`[${_room}] ${_role} left`);
    rooms[_room][_role === 'desktop' ? 'desktop' : 'phone'] = null;
    const other = _role === 'desktop' ? rooms[_room].phone : rooms[_room].desktop;
    if (other?.readyState === 1)
      other.send(JSON.stringify({ type: 'partner-left', role: _role }));
    if (!rooms[_room].desktop && !rooms[_room].phone) delete rooms[_room];
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nFlashBooth v8 running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}\n`);
});
