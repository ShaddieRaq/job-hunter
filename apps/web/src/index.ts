import { createServer } from 'node:http';

const port = Number(process.env.WEB_PORT ?? 3000);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Job Hunter</title>
  </head>
  <body>
    <main>
      <h1>Job Hunter MVP</h1>
      <p>Web app scaffold is running.</p>
    </main>
  </body>
</html>`;

createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, () => {
  console.log(`Web listening on http://localhost:${port}`);
});
