#!/usr/bin/env node
/**
 * Minimal HTTP stub for k6 / security scripts (PostgREST-ish paths).
 * No secrets; returns safe JSON only.
 *
 * Usage: node scripts/mock-api-for-k6.mjs
 * Env: MOCK_PORT (default 18080), MOCK_LATENCY_MS, MOCK_ERROR_RATE (0-1)
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 18080);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS || 0);
const ERROR_RATE = Number(process.env.MOCK_ERROR_RATE || 0);

function maybeFail(res) {
  if (ERROR_RATE > 0 && Math.random() < ERROR_RATE) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'simulated upstream unavailable' }));
    return true;
  }
  return false;
}

function delaySync() {
  if (LATENCY_MS <= 0) return;
  const end = Date.now() + LATENCY_MS;
  while (Date.now() < end) {
    /* sync stall */
  }
}

const server = http.createServer((req, res) => {
  delaySync();
  if (maybeFail(res)) return;

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/rest/v1/products') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Range': '0-0/1',
    });
    res.end(JSON.stringify([{ id: randomUUID(), name: 'stub', sku: 'MOCK-1' }]));
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/')) {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!body) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'empty body' }));
        return;
      }
      try {
        JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'invalid json' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: randomUUID(), _synced: true }]));
    });
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: 1 }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-api-for-k6 listening on http://127.0.0.1:${PORT}`);
});
