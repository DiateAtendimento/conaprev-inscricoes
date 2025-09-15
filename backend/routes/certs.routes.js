import { Router } from "express";
import { emitirCertificadoPDF } from "../services/certs.service.js";

const r = Router();

// body: { cpf }
r.post("/emitir", async (req, res) => {
  try {
    const { cpf } = req.body || {};
    const { buffer, filename } = await emitirCertificadoPDF(String(cpf||"").trim());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

export default r;
