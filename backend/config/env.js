import "dotenv/config";

function list(str) {
  return (str || "").split(",").map(s => s.trim()).filter(Boolean);
}

function getGoogleCredentials() {
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON;
  const rawB64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (rawJson) return JSON.parse(rawJson);
  if (rawB64) return JSON.parse(Buffer.from(rawB64, "base64").toString("utf8"));
  throw new Error("Missing GOOGLE_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_B64");
}

export default {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  corsAllow: list(process.env.CORS_ALLOW_ORIGINS),

  // Recursos Google
  sheetId: process.env.SHEET_ID,                  // planilha principal
  slidesTplId: process.env.SLIDES_TEMPLATE_ID,    // template do certificado (Slides)

  // Datas do evento (TZ São Paulo)
  event: {
    inicio: process.env.EVENTO_INICIO_DATETIME,
    fim: process.env.EVENTO_FIM_DATETIME,
    certAfterHours: Number(process.env.CERT_LIBERA_APOS_HORAS || 24),
  },

  apiKey: process.env.API_KEY, // para rotas admin

  // Credenciais SA
  google: getGoogleCredentials(),
};
