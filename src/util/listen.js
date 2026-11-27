// Listen on the preferred port, falling back to the next free ones so a demo never dies on EADDRINUSE.
export function listenWithFallback(server, preferredPort, { host = '127.0.0.1', attempts = 10 } = {}) {
  return new Promise((resolve, reject) => {
    let port = preferredPort;
    let left = attempts;
    const tryListen = () => {
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        resolve(server.address().port);
      });
    };
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && --left > 0) {
        port += 1;
        setImmediate(tryListen);
      } else if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${preferredPort}-${port} aralığı dolu. Farklı port verin (örn. PORT=8400 / DEMO_PORT=8500).`));
      } else {
        reject(err);
      }
    };
    tryListen();
  });
}
