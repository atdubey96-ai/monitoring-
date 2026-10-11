// Tiny "is the server reachable" check used by /api/diag.
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end('ok');
};
