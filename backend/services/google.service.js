import { google } from "googleapis";
import cfg from "../config/env.js";

function scopeUrl(s) { return `https://www.googleapis.com/auth/${s}`; }

// âš ï¸ Escopos mÃ­nimos:
// - spreadsheets (ler/escrever planilha)
// - presentations (editar Slides)
// - drive (APENAS copiar/exportar PDF do Slides)
// Se quiser 0% Drive, troque o certificado para HTMLâ†’PDF (Puppeteer) no certs.service.js.
export async function getAuth(scopes = ["spreadsheets", "presentations", "drive"]) {
  const creds = cfg.google;
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    scopes.map(scopeUrl)
  );
  await jwt.authorize();
  return jwt;
}

export async function getSheets() {
  const auth = await getAuth(["spreadsheets"]);
  return google.sheets({ version: "v4", auth });
}
export async function getSlides() {
  const auth = await getAuth(["presentations", "drive"]);
  return { slides: google.slides({ version: "v1", auth }), drive: google.drive({ version: "v3", auth }) };
}
