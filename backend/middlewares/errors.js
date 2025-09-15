export default function errorMw(err, req, res, _next) {
  const status = err.status || 500;
  const msg = err.message || "Internal Error";
  if (process.env.NODE_ENV !== "production") {
    console.error("[ERR]", msg, err.stack);
  }
  res.status(status).json({ error: msg });
}
