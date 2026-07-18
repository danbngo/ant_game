// Multiplayer transport. A thin wrapper over a WebSocket connection to the
// relay server (see server/server.js). It handles the lobby handshake (role +
// color exchange) and relays gameplay messages; the actual game protocol
// (full/snapshot/command/message) lives in game.js, which is where the world
// and selection are.
//
// Model: HOST-AUTHORITATIVE. The host runs the whole simulation and broadcasts
// world snapshots; the guest sends input commands and renders what it receives.

(function () {
  let ws = null;
  const handlers = {}; // event name -> callback

  const Net = {
    role: null,       // 'host' | 'guest' | null
    room: null,
    color: null,      // the color THIS player controls
    peerColor: null,  // the other player's chosen color (for lock-out)
    connected: false,
    active: false,    // true from connect() until disconnect()
  };

  Net.isHost = () => Net.role === 'host';
  Net.isGuest = () => Net.role === 'guest';

  Net.on = (evt, cb) => { handlers[evt] = cb; };
  function emit(evt, data) { if (handlers[evt]) handlers[evt](data); }

  Net.connect = function (url, room, color) {
    Net.disconnect();
    Net.room = room;
    Net.color = color || null;
    Net.peerColor = null;
    Net.active = true;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      emit('error', 'Could not open connection. Check the server URL.');
      return;
    }
    ws.addEventListener('open', () => {
      Net.connected = true;
      ws.send(JSON.stringify({ t: 'join', room, color: Net.color }));
    });
    ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case 'role': Net.role = m.role; emit('role', m); break;
        case 'peer-join': Net.peerColor = m.color || null; emit('peer-join', m); break;
        case 'peer-color': Net.peerColor = m.color || null; emit('peer-color', m); break;
        case 'peer-left': emit('peer-left', m); break;
        case 'error': emit('error', m.msg); break;
        default: emit('message', m); break; // gameplay traffic (full/snap/cmd/msg)
      }
    });
    ws.addEventListener('close', () => {
      Net.connected = false;
      if (Net.active) emit('close');
    });
    ws.addEventListener('error', () => { emit('error', 'Connection error.'); });
  };

  Net.send = function (obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  // Change the color this player controls (lobby only) and tell the peer, so
  // they can lock this color out of their own picker.
  Net.setColor = function (color) {
    Net.color = color;
    Net.send({ t: 'color', color });
  };

  Net.disconnect = function () {
    Net.active = false;
    Net.role = null;
    Net.connected = false;
    Net.peerColor = null;
    if (ws) {
      try { ws.onclose = null; ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
  };

  window.Net = Net;
})();
