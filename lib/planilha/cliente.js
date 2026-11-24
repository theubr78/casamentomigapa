// Cliente da API do Apps Script (usado pela função do Netlify e pelo teste de ligação).
// Cada pedido vai assinado com HMAC-SHA256: o Apps Script só aceita quem conhece o segredo.
const crypto = require('crypto');

class ErroPlanilha extends Error {
  constructor(codigo, mensagem) {
    super(mensagem || codigo);
    this.codigo = codigo;
  }
}

function assinar(texto, segredo) {
  return crypto.createHmac('sha256', segredo).update(texto, 'utf8').digest('hex');
}

/** Envelope que o Apps Script espera: { corpo: '<json {ts, acao, dados}>', assinatura }. */
function montarEnvelope(acao, dados, segredo, agora = Date.now()) {
  const corpo = JSON.stringify({ ts: agora, acao, dados: dados || {} });
  return JSON.stringify({ corpo, assinatura: assinar(corpo, segredo) });
}

/**
 * Chama uma ação do Apps Script. Lança ErroPlanilha com `codigo`:
 *  - os códigos do próprio Apps Script (esgotado, itens_invalidos, ocupado, estrutura_planilha…);
 *  - 'indisponivel' se o Google não respondeu a tempo ou devolveu algo que não é a nossa API.
 * Não repete pedidos sozinho: quem chama decide (só leituras podem ser repetidas com segurança).
 */
async function chamarPlanilha(acao, dados, opcoes = {}) {
  const url = opcoes.url || process.env.APPS_SCRIPT_URL;
  const segredo = opcoes.segredo || process.env.APPS_SCRIPT_SEGREDO;
  const tempoLimite = opcoes.tempoLimiteMs || 8000;
  const buscar = opcoes.fetch || fetch;
  if (!url || !segredo) throw new ErroPlanilha('nao_configurado', 'APPS_SCRIPT_URL e APPS_SCRIPT_SEGREDO não configurados.');

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimite);
  let texto;
  try {
    const r = await buscar(url, {
      method: 'POST',
      // text/plain: o Apps Script recebe o corpo cru em e.postData.contents
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: montarEnvelope(acao, dados, segredo),
      redirect: 'follow',
      signal: controle.signal
    });
    texto = await r.text();
  } catch (e) {
    throw new ErroPlanilha('indisponivel', e.name === 'AbortError' ? 'A planilha demorou demais para responder.' : 'Não foi possível falar com a planilha.');
  } finally {
    clearTimeout(relogio);
  }

  let resposta;
  try { resposta = JSON.parse(texto); } catch (e) { resposta = null; }
  if (!resposta || typeof resposta.ok !== 'boolean') {
    // Página HTML de erro do Google (cota, script apagado, implantação errada…)
    throw new ErroPlanilha('indisponivel', 'A planilha respondeu de um jeito inesperado.');
  }
  if (!resposta.ok) throw new ErroPlanilha(resposta.erro || 'erro', resposta.mensagem);
  return resposta.dados;
}

module.exports = { chamarPlanilha, montarEnvelope, assinar, ErroPlanilha };
