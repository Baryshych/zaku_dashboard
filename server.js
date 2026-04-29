const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const STATIC_DIR = __dirname;

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const CHART_JS_PATH = path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');

const server = http.createServer((req, res) => {
  if (req.url === '/chart.js') {
    fs.readFile(CHART_JS_PATH, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('chart.js not found. Run: npm install');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(data);
    });
    return;
  }

  const reqPath = req.url === '/' ? 'index.html' : req.url;
  const filePath = path.join(STATIC_DIR, decodeURIComponent(reqPath));
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mime[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('NOT FOUND');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, path: '/ws' });

const boards = new Map();      // boardId -> ws
const dashboards = new Set();  // ws

function broadcastDashboards(obj) {
  const payload = JSON.stringify(obj);
  dashboards.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

function forwardToBoard(targetId, obj) {
  const bws = boards.get(targetId);
  if (bws && bws.readyState === WebSocket.OPEN) {
    bws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

wss.on('connection', (ws, req) => {
  let isBoard = false;
  let boardId = null;
  let registered = false;

  const registerTimer = setTimeout(() => {
    if (!registered) {
      dashboards.add(ws);
      console.log(`[DASHBOARD] connected from ${req.socket.remoteAddress} (${dashboards.size} total)`);
      ws.send(JSON.stringify({ type: 'hello', role: 'dashboard' }));
      // Send current status of all connected boards
      boards.forEach((_, id) => {
        ws.send(JSON.stringify({ type: 'board', id: id, online: true }));
      });
    }
  }, 1500);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch (e) { return; }
    if (!registered && msg.type === 'register' && msg.board) {
      clearTimeout(registerTimer);
      registered = true;
      isBoard = true;
      boardId = msg.board;
      boards.set(boardId, ws);
      console.log(`[BOARD] ${boardId} registered from ${req.socket.remoteAddress}`);
      broadcastDashboards({ type: 'board', id: boardId, online: true });
      return;
    }

    if (!registered) return;

    if (isBoard) {
      if (msg.type === 'emergency') {
        broadcastDashboards({ type: 'emergency', board: boardId, reason: msg.reason });
      } else if (msg.type === 'error') {
        broadcastDashboards({ type: 'error', board: boardId, text: msg.text });
      } else {
        broadcastDashboards({ type: 'telemetry', board: boardId, data: msg });
      }
    } else {
      if (msg.cmd === 'stop') {
        boards.forEach(bws => {
          if (bws.readyState === WebSocket.OPEN) bws.send(JSON.stringify(msg));
        });
      } else if (msg.target) {
        const ok = forwardToBoard(msg.target, msg);
        if (!ok) {
          ws.send(JSON.stringify({ type: 'error', text: `Board ${msg.target} offline` }));
        }
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(registerTimer);
    if (isBoard && boardId) {
      boards.delete(boardId);
      broadcastDashboards({ type: 'board', id: boardId, online: false });
      console.log(`[BOARD] ${boardId} disconnected`);
    } else {
      dashboards.delete(ws);
    }
  });

  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ZAKU-OS relay listening on ws://0.0.0.0:${PORT}/ws`);
  console.log(`Dashboard: http://0.0.0.0:${PORT}`);
});
