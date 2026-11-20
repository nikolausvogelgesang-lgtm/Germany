import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3001);

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', mode: 'scaffold' }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, () => {
  process.stdout.write(`Second Take backend listening on http://localhost:${port}\n`);
});
