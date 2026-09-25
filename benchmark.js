const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const autocannon = require('autocannon');

const PYTHON = path.join(__dirname, '.venv/bin/python');
const SERVERS = {
  FastAPI: {
    command: [PYTHON, '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8101'],
    port: 8101,
  },
  Express: { command: [process.execPath, 'express-server.js'], port: 8102 },
  Fastify: { command: [process.execPath, 'fastify-server.js'], port: 8103 },
};
const ROUTES = ['/', '/slow_endpoint', '/slow_endpoint_fixed'];
const CPU_ROUTES = ['/high_cpu_endpoint', '/high_cpu_endpoint_fixed'];
const CONCURRENCY = [1, 10, 50, 100];
const REPEATS = 2;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Server did not start: ${url}`);
}

async function withServer(server, callback) {
  const child = spawn(server.command[0], server.command.slice(1), {
    cwd: __dirname,
    stdio: 'ignore',
  });
  const closed = once(child, 'close');

  let startupError;
  const stopped = closed.catch((error) => { startupError = error; });
  try {
    const url = `http://127.0.0.1:${server.port}`;
    await waitForServer(url);
    if (startupError) throw startupError;
    return await callback(url);
  } finally {
    child.kill();
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await stopped;
    clearTimeout(timer);
  }
}

async function measure(url, connections, options = {}) {
  const result = await autocannon({
    url, connections, duration: 3, timeout: 20, ...options,
  });
  return {
    requests: result.requests.total,
    rps: result.requests.average,
    mean_ms: result.requests.total ? result.latency.average : null,
    p97_5_ms: result.requests.total ? result.latency.p97_5 : null,
    p99_ms: result.requests.total ? result.latency.p99 : null,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    status_codes: result.statusCodeStats,
    duration_s: result.duration,
  };
}

async function benchmark(framework, server) {
  const results = [];
  for (const route of ROUTES) {
    for (const concurrency of CONCURRENCY) {
      for (let repeat = 1; repeat <= REPEATS; repeat++) {
        const metrics = await withServer(server, async (url) => {
          await autocannon({ url: url + route, connections: 1, amount: 5 });
          const options = route === '/slow_endpoint'
            ? { amount: Math.max(30, concurrency * 2) }
            : {};
          return measure(url + route, concurrency, options);
        });
        results.push({ framework, scenario: 'isolated', route, concurrency, repeat, ...metrics });
        console.log(framework, route, concurrency, metrics.rps);
      }
    }
  }
  return results;
}

async function benchmarkCpu() {
  const results = [];
  for (const route of CPU_ROUTES) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      await withServer(SERVERS.FastAPI, async (url) => {
        await autocannon({ url: url + route, connections: 1, amount: 5 });
        const [cpu, root] = await Promise.all([
          measure(url + route, 1, { duration: 5 }),
          measure(url + '/', 1, { duration: 5 }),
        ]);
        results.push(
          { scenario: 'cpu_with_root', framework: 'FastAPI', cpu_variant: route, route, repeat, concurrency: 1, ...cpu },
          { scenario: 'cpu_with_root', framework: 'FastAPI', cpu_variant: route, route: '/', repeat, concurrency: 1, ...root },
        );
      });
      console.log('CPU mixed', route, repeat);
    }
  }
  return results;
}

async function main() {
  const results = [];
  for (const [name, server] of Object.entries(SERVERS)) {
    results.push(...await benchmark(name, server));
  }
  results.push(...await benchmarkCpu());
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { SERVERS, withServer, measure };
