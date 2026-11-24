/**
 * API chamada pela função do Netlify (nunca pelo navegador).
 *
 * Todo pedido vem assinado: { corpo: '<json>', assinatura: hex(HMAC-SHA256(corpo, SEGREDO_API)) },
 * e o corpo traz { ts, acao, dados }. Pedido sem assinatura válida ou com mais de 5 minutos é recusado.
 * A resposta é sempre JSON: { ok: true, dados } ou { ok: false, erro, mensagem }.
 */

var ACOES_ = {
  saude: function () { return saude_(); },
  convidados: function () { return listarConvidados_(); },
  responder: function (dados) { return comTrava_(function () { return responder_(dados); }); },
  presentes: function () { return listarPresentes_(); },
  escolher: function (dados) { return comTrava_(function () { return escolher_(dados); }); }
};

function doPost(e) {
  var saida;
  try {
    var pedido = lerPedidoAssinado_(e);
    var acao = ACOES_[pedido.acao];
    if (!acao) throw new ErroApi('acao_invalida', 'Ação desconhecida.');
    saida = { ok: true, dados: acao(pedido.dados || {}) };
  } catch (erro) {
    saida = respostaDeErro_(erro);
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

/** Aberto no navegador, só confirma que o serviço está no ar (nenhum dado). */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, servico: 'site-casamento', versao: VERSAO }))
    .setMimeType(ContentService.MimeType.JSON);
}

function assinar_(texto, segredo) {
  return hex_(Utilities.computeHmacSha256Signature(texto, segredo, Utilities.Charset.UTF_8));
}

function lerPedidoAssinado_(e) {
  var segredo = propriedade_(PROPRIEDADES.SEGREDO);
  if (segredo.length < 32) throw new ErroApi('nao_configurado', 'O segredo da API não foi configurado (menu Casamento → Configurar).');

  var envelope;
  try { envelope = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (x) { envelope = null; }
  if (!envelope || typeof envelope.corpo !== 'string' || typeof envelope.assinatura !== 'string') {
    throw new ErroApi('nao_autorizado', 'Pedido não autorizado.');
  }
  if (!iguais_(assinar_(envelope.corpo, segredo), envelope.assinatura.toLowerCase())) {
    throw new ErroApi('nao_autorizado', 'Pedido não autorizado.');
  }
  var corpo = JSON.parse(envelope.corpo);
  if (!(Math.abs(Date.now() - Number(corpo.ts)) <= LIMITES.VALIDADE_PEDIDO_MS)) {
    throw new ErroApi('nao_autorizado', 'Pedido expirado.');
  }
  return corpo;
}

function respostaDeErro_(erro) {
  if (erro instanceof ErroApi) return { ok: false, erro: erro.codigo, mensagem: erro.message };
  if (erro instanceof ErroEstrutura) {
    alertar_('A planilha mudou de estrutura', erro.message);
    return { ok: false, erro: 'estrutura_planilha', mensagem: erro.message };
  }
  console.error(erro && erro.stack ? erro.stack : String(erro));
  alertar_('Erro inesperado no site', erro && erro.stack ? erro.stack : String(erro));
  return { ok: false, erro: 'interno', mensagem: 'Erro interno.' };
}

/** Teste de ligação: contagens, sem nenhum dado pessoal. */
function saude_() {
  return {
    versao: VERSAO,
    convidados: listarConvidados_().length,
    presentes: listarPresentes_().presentes.length
  };
}
