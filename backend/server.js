import express from "express";
import morgan from "morgan";
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
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));
app.use(security);
app.use(corsMw);

// rotas
app.use("/api", healthRoutes);
app.use("/api/inscricoes", inscricoesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/certificado", certsRoutes);

// health check do Render
app.get("/healthz", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// errors
app.use(errorMw);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API up on :${port}`));
