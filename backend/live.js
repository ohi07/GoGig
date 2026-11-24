const streams = new Map();

function subscribe(res, userId, expiresAt) {
  const connections = streams.get(userId) || new Set();
  if (connections.size >= 8) {
    res.writeHead(429).end();
    return;
  }
  streams.set(userId, connections);
  connections.add(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: refresh\n\n');
  const heartbeat = setInterval(() => {
    if (!res.write(': heartbeat\n\n')) res.end();
  }, 20000);
  const expiry = setTimeout(() => res.end(), Math.max(0, expiresAt - Date.now()));
  res.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(expiry);
    connections.delete(res);
    if (!connections.size) streams.delete(userId);
  });
}

function publish(ids) {
  for (const id of new Set(ids)) {
    for (const res of streams.get(id) || []) {
      if (!res.write('data: refresh\n\n')) res.end();
    }
  }
}

function disconnect(userId) {
  for (const res of streams.get(userId) || []) res.end();
}

module.exports = { subscribe, publish, disconnect };
