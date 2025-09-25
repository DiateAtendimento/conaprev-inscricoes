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
  // ===== Botão "Emitir certificado" (id alinhado ao HTML) =====
  document.getElementById('btnEmitirCert')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const cpf = prompt('Informe seu CPF (somente números)');
    if (!cpf) return;
    try {
      const pdf = await emitirCertificado(cpf);
      downloadBlob(pdf, 'certificado_conaprev.pdf');
    } catch (err) {
      alert(err?.message || 'Não foi possível emitir o certificado.');
    }
  });

  // ===== Atalho de hospedagem (abre em nova aba com noopener) =====
  document.getElementById('btnHospedagem')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open('/hospedagem.html', '_blank', 'noopener');
  });

  // IMPORTANTE:
  // O botão #adminAccessBtn é tratado por /src/js/admin.js (modal + senha).
  // Não adicionamos listeners aqui para evitar conflitos.
});

/* =========================
   TESTES RÁPIDOS NO CONSOLE
   ========================= */
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
    const formData = { _rowIndex: 2, cpf: '00000000000', nome: 'Fulano Atualizado' };
    const r = await atualizarInscricao(formData, 'Conselheiro');
    console.log('atualizar:', r);
  } catch (e) { console.error(e); }
};

window.testConfirmar = async () => {
  try {
    const formData = { _rowIndex: 2, cpf: '00000000000', nome: 'Fulano Atualizado' };
    const codigo = await confirmarInscricao(formData, 'Conselheiro');
    console.log('confirmar -> codigo:', codigo);
  } catch (e) { console.error(e); }
};

window.testCancelar = async () => {
  try {
    const r = await cancelarInscricao(2, 'Conselheiro');
    console.log('cancelar:', r);
  } catch (e) { console.error(e); }
};
