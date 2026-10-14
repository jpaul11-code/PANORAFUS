const { parse, body, id } = require('../middleware/validation');

function notificationStream(db, auth, config) {
  return async function stream(req, res) {
    parse(body({}), req.query);
    let cursor;
    if (req.headers['last-event-id']) {
      const notification_id = parse(id, req.headers['last-event-id']);
      cursor = await db.notification.findFirst({ where: { id: notification_id, user_id: req.user.id } });
      if (!cursor) throw require('../middleware/errors').missing();
    }
    res.status(200).set({
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    let stopped = false;
    let timer;
    const stop = () => { stopped = true; clearTimeout(timer); if (!res.writableEnded) res.end(); };
    res.on('close', stop);
    const expiry = setTimeout(stop, Math.max(0, req.token_exp * 1000 - Date.now()));
    expiry.unref();
    res.on('close', () => clearTimeout(expiry));
    async function poll() {
      try {
        if (stopped) return;
        await auth.authenticate(req.access_token);
        const rows = await db.notification.findMany({
          where: { user_id: req.user.id, ...(cursor ? { OR: [
            { created_at: { gt: cursor.created_at } },
            { created_at: cursor.created_at, id: { gt: cursor.id } }
          ] } : {}) },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }], take: 100
        });
        if (stopped) return;
        for (const row of rows) {
          const writable = res.write(`id: ${row.id}\nevent: notification\ndata: ${JSON.stringify(row)}\n\n`);
          cursor = row;
          if (!writable) {
            await new Promise(resolve => {
              const finish = () => { res.off('drain', finish); res.off('close', finish); resolve(); };
              res.once('drain', finish); res.once('close', finish);
            });
          }
          if (stopped) return;
        }
        res.write(': heartbeat\n\n');
        timer = setTimeout(poll, rows.length === 100 ? 0 : config.ssePoll);
        timer.unref();
      } catch { stop(); }
    }
    await poll();
  };
}
module.exports = { notificationStream };
