// Ant Farm multiplayer relay server.
//
// A dumb, host-authoritative relay: it never simulates the game. It just pairs
// two players into a room and forwards messages between them. The HOST (first to
// join a room) runs the whole simulation and broadcasts world snapshots; the
// GUEST sends input commands and renders what it's told.
//
//   Run:   npm install && npm run server
//   LAN:   friends connect to ws://<your-lan-ip>:8080
//   Net:   deploy anywhere Node runs (Render/Fly/Railway/VPS) and use wss://...
//
// Protocol (JSON messages, all have a `t` type tag):
//   client -> server:  {t:'join', room, color}
//   server -> client:  {t:'role', role:'host'|'guest', room}
//                      {t:'peer-join', color}     // other player joined (+ their color)
//                      {t:'peer-color', color}    // other player changed color
//                      {t:'peer-left'}
//                      {t:'full'}                 // taken colors, room state
//                      {t:'error', msg}
//   Anything else is relayed verbatim to the other player in the room.

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// room code -> { host: ws|null, guest: ws|null }
const rooms = new Map();

function peerOf(room, ws) {
  const r = rooms.get(room);
  if (!r) return null;
  return ws === r.host ? r.guest : r.host;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ant Farm relay is running. Connect a game client via WebSocket.\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg.t === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) { send(ws, { t: 'error', msg: 'Missing room code.' }); return; }
      let r = rooms.get(code);
      if (!r) { r = { host: null, guest: null }; rooms.set(code, r); }

      if (!r.host) {
        r.host = ws;
        ws.room = code; ws.role = 'host'; ws.color = msg.color || null;
        send(ws, { t: 'role', role: 'host', room: code });
      } else if (!r.guest) {
        if (r.host.color && msg.color && r.host.color === msg.color) {
          send(ws, { t: 'error', msg: 'That color is taken. Pick another.' });
          return;
        }
        r.guest = ws;
        ws.room = code; ws.role = 'guest'; ws.color = msg.color || null;
        send(ws, { t: 'role', role: 'guest', room: code });
        // Tell each side about the other.
        send(r.host, { t: 'peer-join', color: ws.color });
        send(r.guest, { t: 'peer-join', color: r.host.color });
      } else {
        send(ws, { t: 'error', msg: 'Room is full.' });
      }
      return;
    }

    // Track color changes made in the lobby so the relay can enforce uniqueness.
    if (msg.t === 'color') {
      ws.color = msg.color || null;
      const peer = peerOf(ws.room, ws);
      send(peer, { t: 'peer-color', color: ws.color });
      return;
    }

    // Everything else is gameplay traffic: relay to the other player.
    if (ws.room) {
      const peer = peerOf(ws.room, ws);
      if (peer && peer.readyState === peer.OPEN) peer.send(raw.toString());
    }
  });

  ws.on('close', () => {
    const r = ws.room && rooms.get(ws.room);
    if (!r) return;
    const peer = peerOf(ws.room, ws);
    send(peer, { t: 'peer-left' });
    if (r.host === ws) r.host = null;
    if (r.guest === ws) r.guest = null;
    if (!r.host && !r.guest) rooms.delete(ws.room);
  });
});

server.listen(PORT, () => {
  console.log(`Ant Farm relay listening on port ${PORT}`);
});
