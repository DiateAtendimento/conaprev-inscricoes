// backend/server.js
import "dotenv/config";
import express from "express";
import morgan from "morgan";

import security from "./middlewares/security.js";
import corsMw from "./middlewares/cors.js";
import errorMw from "./middlewares/errors.js";

import healthRoutes from "./routes/health.routes.js";
import inscricoesRoutes from "./routes/inscricoes.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import certsRoutes from "./routes/certs.routes.js";

const app = express();

/**
 * IMPORTANTE no Render:
 * Em vez de `true` (permissivo), configure hops conhecidos.
 * `1` = confia apenas no primeiro proxy (o do Render).
 * Isso satisfaz o express-rate-limit e mantém IPs corretos.
 */
app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));
app.use(security);   // helmet + hpp + rate-limit (ver arquivo atualizado abaixo)
app.use(corsMw);

// rotas API
app.use("/api", healthRoutes);
app.use("/api/inscricoes", inscricoesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/certificado", certsRoutes);

// rota raiz amigável (evita 404 no "/")
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "CONAPREV Inscrições API",
    docs: "/api",
    time: new Date().toISOString(),
  });
});

// health check do Render
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// 404 para demais caminhos
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// errors
app.use(errorMw);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API up on :${port}`));
