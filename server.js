/**
 * FlashBooth — Signaling + Gallery Server (v9 — Supabase)
 * Env vars yang dibutuhkan di Railway:
 *   SUPABASE_URL  = https://gejqhemladxrewattwly.supabase.co
 *   SUPABASE_KEY  = eyJhbGci...  (anon public key)
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gejqhemladxrewattwly.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// ══════════════════════════════════════════════
// SUPABASE HELPERS — pakai fetch bawaan Node 18+
// ══════════════════════════════════════════════
const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbQuery(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { ...SB_HEADERS, ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// Upload gambar ke Supabase Storage, return public URL
async function uploadImage(id, base64DataUrl) {
  // Strip header "data:image/png;base64,"
  const [header, b64] = base64DataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const ext  = mime.split('/')[1] || 'png';
  const buf  = Buffer.from(b64, 'base64');
  const fileName = `${id}.${ext}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/photos/${fileName}`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: buf,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed: ${err}`);
  }
  // Public URL format Supabase Storage
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${fileName}`;
}

// ── Gallery CRUD ──
async function galleryAdd(username, caption, imageB64) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. Upload gambar ke Storage
  const imageUrl = await uploadImage(id, imageB64);

  // 2. Insert row ke tabel gallery
  const { ok, data } = await sbQuery('/gallery', {
    method: 'POST',
    body: JSON.stringify({
      id,
      username: username.slice(0, 32),
      caption: (caption || '').slice(0, 200),
      image_url: imageUrl,
      created_at: Date.now(),
      likes: 0,
    }),
  });
  if (!ok) throw new Error(JSON.stringify(data));
  return { id, imageUrl };
}

async function galleryList(page = 0, limit = 12) {
  const from = page * limit;
  const to   = from + limit - 1;

  const { ok, data } = await sbQuery(
    `/gallery?select=*&order=created_at.desc&limit=${limit}&offset=${from}`,
    { headers: { 'Range-Unit': 'items', 'Range': `${from}-${to}`, 'Prefer': 'count=exact' } }
  );
  if (!ok) return { items: [], total: 0, page, hasMore: false };

  const items = (Array.isArray(data) ? data : []).map(e => ({
    id: e.id,
    username: e.username,
    caption: e.caption,
    imageUrl: e.image_url,
    createdAt: e.created_at,
    likes: e.likes,
  }));

  // Cek apakah masih ada lebih
  const hasMore = items.length === limit;
  return { items, page, hasMore };
}

async function galleryLike(id) {
  // Increment likes via RPC atau read-modify-write
  const { ok: getOk, data: rows } = await sbQuery(`/gallery?id=eq.${id}&select=likes`);
  if (!getOk || !rows[0]) throw new Error('not found');
  const newLikes = (rows[0].likes || 0) + 1;
  const { ok, data } = await sbQuery(`/gallery?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ likes: newLikes }),
  });
  if (!ok) throw new Error(JSON.stringify(data));
  return newLikes;
}

// ══════════════════════════════════════════════
// HTTP SERVER
// ══════════════════════════════════════════════
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 8_000_000) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }

  // ── POST /api/gallery/share ──
  if (url === '/api/gallery/share' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { username, caption, imageB64 } = body;
      if (!username || !imageB64) { json(res, { error: 'username & imageB64 required' }, 400); return; }
      if (!imageB64.startsWith('data:image/')) { json(res, { error: 'invalid image' }, 400); return; }
      if (imageB64.length > 8_000_000) { json(res, { error: 'image too large (max ~6MB)' }, 413); return; }
      const { id } = await galleryAdd(username, caption || '', imageB64);
      json(res, { ok: true, id });
    } catch(e) {
      console.error('[share]', e.message);
      json(res, { error: e.message }, 500);
    }
    return;
  }

  // ── GET /api/gallery?page=0 ──
  if (url === '/api/gallery' && req.method === 'GET') {
    try {
      const params = new URLSearchParams(req.url.split('?')[1] || '');
      const page = Math.max(0, parseInt(params.get('page') || '0'));
      json(res, await galleryList(page));
    } catch(e) {
      console.error('[gallery list]', e.message);
      json(res, { items: [], page: 0, hasMore: false });
    }
    return;
  }

  // ── POST /api/gallery/like ──
  if (url === '/api/gallery/like' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const likes = await galleryLike(body.id);
      json(res, { ok: true, likes });
    } catch(e) {
      json(res, { error: e.message }, 404);
    }
    return;
  }

  // ── Static files ──
  let fp = url;
  if (fp === '/' || fp === '') fp = '/filmbooth.html';
  if (fp === '/gallery') fp = '/filmbooth.html';
  fp = path.join(__dirname, fp);

  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    const mime = {
      '.html': 'text/html;charset=utf-8',
      '.js':   'text/javascript',
      '.css':  'text/css',
    }[path.extname(fp)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

// ══════════════════════════════════════════════
// WEBSOCKET — WebRTC signaling
// ══════════════════════════════════════════════
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
  console.log(`\nFlashBooth v9-supabase running on port ${PORT}`);
  console.log(`Supabase: ${SUPABASE_URL}\n`);
});
