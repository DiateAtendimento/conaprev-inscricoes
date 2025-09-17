// frontend/src/js/main.js
import {
  buscarInscricao,
  criarInscricao,
  atualizarInscricao,
  confirmarInscricao,
  cancelarInscricao,
  emitirCertificado,
  baixarExportXlsx
} from './api.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', () => {
  // ===== Botão "Certificado" (já existe no HTML) =====
  document.getElementById('emitirCertificadoBtn')?.addEventListener('click', async () => {
    const cpf = prompt('Informe seu CPF (somente números)');
    if (!cpf) return;
    try {
      const pdf = await emitirCertificado(cpf);
      downloadBlob(pdf, 'certificado_conaprev.pdf');
    } catch (e) {
      alert(e.message || e);
    }
  });

  // ===== Botão "Administrador" (exporta XLSX com API key) =====
  document.getElementById('adminAccessBtn')?.addEventListener('click', async () => {
    const key = prompt('Digite a API key administrativa:');
    if (!key) return;
    try {
      const xlsx = await baixarExportXlsx(key);
      downloadBlob(xlsx, 'inscricoes.xlsx');
    } catch (e) {
      alert(e.message || e);
    }
  });
});

/* =========================
   TESTES RÁPIDOS NO CONSOLE
   =========================
   Abra o site com ?preview=CONAPREV83_DEV para ver a app.
   Depois, no DevTools (Console), chame:

   - window.testBuscar()
   - window.testCriar()
   - window.testAtualizar()
   - window.testConfirmar()
   - window.testCancelar()
*/

window.testBuscar = async () => {
  try {
    const r = await buscarInscricao('00000000000', 'Conselheiro');
    console.log('buscar:', r);
  } catch (e) { console.error(e); }
};

window.testCriar = async () => {
  try {
    const formData = { cpf: '00000000000', nome: 'Fulano da Silva', ufsigla: 'AP' };
    const codigo = await criarInscricao(formData, 'Conselheiro');
    console.log('criar -> codigo:', codigo);
  } catch (e) { console.error(e); }
};

window.testAtualizar = async () => {
  try {
    // suponha que você descobriu _rowIndex pelo resultado do buscar
    const formData = { _rowIndex: 2, cpf: '00000000000', nome: 'Fulano Atualizado' };
    const r = await atualizarInscricao(formData, 'Conselheiro');
    console.log('atualizar:', r);
  } catch (e) { console.error(e); }
};

window.testConfirmar = async () => {
  try {
    // idem: precisa do _rowIndex; confirma e gera número se não existir
    const formData = { _rowIndex: 2, cpf: '00000000000', nome: 'Fulano Atualizado' };
    const codigo = await confirmarInscricao(formData, 'Conselheiro');
    console.log('confirmar -> codigo:', codigo);
  } catch (e) { console.error(e); }
};

window.testCancelar = async () => {
  try {
    const r = await cancelarInscricao(2, 'Conselheiro'); // apaga a linha 2
    console.log('cancelar:', r);
  } catch (e) { console.error(e); }
};
