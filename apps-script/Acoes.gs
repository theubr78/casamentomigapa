/**
 * Ações da API. Leituras não usam trava; gravações rodam dentro de comTrava_ (ver Api.gs).
 * A regra de BUSCA por nome fica na função do Netlify (testada lá); aqui ficam os dados e as
 * regras que precisam rodar dentro da trava (ex.: "ainda tem unidade disponível?").
 */

// ---------- convidados ----------

function lerConvidados_() {
  return lerTabela_(aba_(planilhaConvidados_(), ABAS.CONVIDADOS), COLUNAS.CONVIDADOS, OBRIGATORIAS.CONVIDADOS);
}

/** Quem ainda não tem ID (linha nova) ganha um aqui, com a trava. */
function convidadosComId_() {
  var t = lerConvidados_();
  var faltaId = t.linhas.some(function (l) { return texto_(l.v.nome) && !texto_(l.v.id); });
  if (faltaId) {
    comTrava_(function () { atribuirIds_(lerConvidados_(), 'nome', PREFIXO_ID.CONVIDADO); });
    t = lerConvidados_();
  }
  return t;
}

function statusDaPresenca_(v) {
  var p = norm_(v);
  if (p === norm_(PRESENCA.SIM)) return 'vai';
  if (p === norm_(PRESENCA.NAO)) return 'nao';
  return null;
}

/** Mesmo texto em "Convite" = confirmam juntos. Em branco = a pessoa confirma sozinha. */
function chaveConvite_(linha) {
  var c = norm_(linha.v.convite);
  return c ? 'g:' + c : 'i:' + texto_(linha.v.id);
}

/** Lista para a busca do site (a lista nunca vai para o navegador; a função devolve só o convite achado). */
function listarConvidados_() {
  return convidadosComId_().linhas
    .filter(function (l) { return texto_(l.v.nome) && texto_(l.v.id); })
    .map(function (l) {
      return {
        id: texto_(l.v.id),
        nome: texto_(l.v.nome),
        outros: String(l.v.outros == null ? '' : l.v.outros).split(/[;,\n]/)
          .map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean),
        convite: chaveConvite_(l),
        status: statusDaPresenca_(l.v.presenca),
        respondidoEm: dataIso_(l.v.respondidoEm)
      };
    });
}

/**
 * Grava a resposta de um convite. dados = { pedido, itens: [{ id, status: 'vai'|'nao' }] }
 * Regras: todos os IDs existem, são do mesmo convite e cobrem o convite inteiro.
 */
function responder_(dados) {
  var itens = dados && dados.itens;
  var invalido = new ErroApi('itens_invalidos', 'Marque uma opção para cada nome.');
  if (!Array.isArray(itens) || !itens.length || itens.length > LIMITES.ITENS_RESPOSTA) throw invalido;

  var t = lerConvidados_();
  var porId = {};
  t.linhas.forEach(function (l) { var id = texto_(l.v.id); if (id && texto_(l.v.nome)) porId[id] = l; });

  var marcados = {};
  itens.forEach(function (i) {
    if (!i || typeof i.id !== 'string' || !porId[i.id] || marcados[i.id] || (i.status !== 'vai' && i.status !== 'nao')) throw invalido;
    marcados[i.id] = i.status;
  });

  var grupo = chaveConvite_(porId[itens[0].id]);
  var membros = Object.keys(porId).filter(function (id) { return chaveConvite_(porId[id]) === grupo; });
  if (membros.length !== itens.length || membros.some(function (id) { return !marcados[id]; })) throw invalido;

  var agora = new Date();
  var respostas = lerTabela_(aba_(planilhaConvidados_(), ABAS.RESPOSTAS), COLUNAS.RESPOSTAS, Object.keys(COLUNAS.RESPOSTAS));
  var historico = [], saida = [];
  membros.forEach(function (id) {
    var l = porId[id];
    var presenca = marcados[id] === 'vai' ? PRESENCA.SIM : PRESENCA.NAO;
    escreverCelulas_(t, l.linha, { presenca: presenca, respondidoEm: agora, origem: 'Site' });
    historico.push({
      data: agora, pedido: textoSeguro_(dados.pedido, 64), convidadoId: id,
      nome: textoSeguro_(l.v.nome, LIMITES.NOME), presenca: presenca, convite: textoSeguro_(l.v.convite, LIMITES.NOME)
    });
    saida.push({ id: id, nome: texto_(l.v.nome), status: marcados[id] });
  });
  acrescentarLinhas_(respostas, historico);
  return { data: agora.toISOString(), itens: saida };
}

// ---------- presentes ----------

function lerPresentes_() {
  return lerTabela_(aba_(planilhaPresentes_(), ABAS.PRESENTES), COLUNAS.PRESENTES, OBRIGATORIAS.PRESENTES, { links: 'link' });
}

function presentesComId_() {
  var t = lerPresentes_();
  var faltaId = t.linhas.some(function (l) { return texto_(l.v.nome) && !texto_(l.v.id); });
  if (faltaId) {
    comTrava_(function () { atribuirIds_(lerPresentes_(), 'nome', PREFIXO_ID.PRESENTE); });
    t = lerPresentes_();
  }
  return t;
}

function lerEscolhas_() {
  return lerTabela_(aba_(planilhaPresentes_(), ABAS.ESCOLHAS), COLUNAS.ESCOLHAS, Object.keys(COLUNAS.ESCOLHAS));
}

/** Escolhas ativas (não canceladas) e conferidas, por ID de presente. */
function contarEscolhas_(tabela) {
  var ativas = {}, conferidas = {};
  tabela.linhas.forEach(function (l) {
    var id = texto_(l.v.presenteId);
    if (!id || l.v.cancelado === true) return;
    ativas[id] = (ativas[id] || 0) + 1;
    if (l.v.conferido === true) conferidas[id] = (conferidas[id] || 0) + 1;
  });
  return { ativas: ativas, conferidas: conferidas };
}

/** Converte uma linha da planilha em presente; devolve { problema } se os dados estiverem errados. */
function presenteDaLinha_(l) {
  var nome = texto_(l.v.nome), id = texto_(l.v.id);
  if (!nome || !id) return null;
  var ref = 'Linha ' + l.linha + ' ("' + nome + '")';
  var tipoTxt = norm_(l.v.tipo);
  var tipo = tipoTxt === norm_(TIPO.COTA) ? 'cota' : tipoTxt === norm_(TIPO.ITEM) ? 'item' : null;
  var valor = Number(l.v.valor), qtd = Number(l.v.qtd);
  if (!tipo) return { problema: ref + ': o Tipo deve ser "' + TIPO.ITEM + '" ou "' + TIPO.COTA + '".' };
  if (typeof l.v.valor !== 'number' || !(valor > 0) || valor > LIMITES.VALOR_MAXIMO) return { problema: ref + ': Valor (R$) inválido.' };
  if (typeof l.v.qtd !== 'number' || !Number.isInteger(qtd) || qtd < 0 || qtd > 1000) return { problema: ref + ': Qtd desejada deve ser um número inteiro.' };
  var obs = texto_(l.v.obs);
  return {
    id: id,
    categoria: texto_(l.v.categoria) || 'Outros',
    nome: nome,
    tipo: tipo,
    valorCentavos: Math.round(valor * 100),
    prioridade: texto_(l.v.prioridade),
    qtd: qtd,
    observacao: /^[-–—\s]*$/.test(obs) ? '' : obs,
    link: linkSeguro_(l.link) || linkSeguro_(l.v.link),
    mostrar: norm_(l.v.mostrar) !== 'nao'
  };
}

/** Todos os presentes com as contagens; a função do Netlify decide o que mostrar e em que ordem. */
function listarPresentes_() {
  var t = presentesComId_();
  var c = contarEscolhas_(lerEscolhas_());
  var presentes = [], problemas = [];
  t.linhas.forEach(function (l) {
    var p = presenteDaLinha_(l);
    if (!p) return;
    if (p.problema) { problemas.push(p.problema); return; }
    p.escolhidos = c.ativas[p.id] || 0;
    p.conferidos = c.conferidas[p.id] || 0;
    presentes.push(p);
  });
  if (problemas.length) alertar_('Presentes com dados a corrigir', 'Estes presentes não aparecem no site até serem corrigidos:\n' + problemas.join('\n'));
  return { presentes: presentes, problemas: problemas.length };
}

/**
 * Registra uma escolha. dados = { pedido, presenteId, modo: 'comprar'|'pix', convidadoId, nomeDigitado, recado }
 * Regras (dentro da trava):
 *  - o mesmo "pedido" (clique repetido, nova tentativa) nunca grava duas vezes;
 *  - cada escolha ativa (comprar ou Pix) ocupa uma unidade/cota; esgotou → recusa;
 *  - Cota Pix não aceita "comprar"; quem escolhe precisa estar na lista de convidados.
 */
function escolher_(dados) {
  dados = dados || {};
  var pedido = String(dados.pedido || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(pedido)) throw new ErroApi('pedido_invalido', 'Pedido inválido. Recarregue a página.');
  var modo = dados.modo === 'comprar' ? MODO.COMPRAR : dados.modo === 'pix' ? MODO.PIX : null;
  if (!modo) throw new ErroApi('modo_invalido', 'Escolha comprar ou Pix.');

  var linhaP = lerPresentes_().linhas.filter(function (l) { return texto_(l.v.id) === String(dados.presenteId || ''); })[0];
  var p = linhaP && presenteDaLinha_(linhaP);
  if (!p || p.problema || !p.mostrar) throw new ErroApi('presente_nao_encontrado', 'Este presente não está mais disponível.');

  var escolhas = lerEscolhas_();
  var contagem = contarEscolhas_(escolhas);
  var ocupados = contagem.ativas[p.id] || 0;
  var anterior = escolhas.linhas.filter(function (l) { return texto_(l.v.pedido) === pedido; })[0];
  if (anterior) {
    return { presenteId: p.id, restantes: Math.max(0, p.qtd - ocupados), link: texto_(anterior.v.modo) === MODO.COMPRAR ? p.link : '', repetido: true };
  }

  if (p.tipo === 'cota' && modo === MODO.COMPRAR) throw new ErroApi('so_pix', 'Este presente é só por Pix.');
  if (ocupados >= p.qtd) {
    throw new ErroApi('esgotado', p.tipo === 'cota' ? 'As cotas deste presente já foram preenchidas.' : 'Alguém acabou de escolher este presente.');
  }

  var convidado = lerConvidados_().linhas.filter(function (l) { return texto_(l.v.id) === String(dados.convidadoId || '') && texto_(l.v.nome); })[0];
  if (!convidado) throw new ErroApi('convidado_nao_encontrado', 'Não encontramos seu nome na lista de convidados.');

  acrescentarLinhas_(escolhas, [{
    data: new Date(),
    pedido: pedido,
    presenteId: p.id,
    presente: textoSeguro_(p.nome, 200),
    categoria: textoSeguro_(p.categoria, 80),
    valor: p.valorCentavos / 100,
    modo: modo,
    nomeDigitado: textoSeguro_(dados.nomeDigitado, LIMITES.NOME),
    convidadoId: texto_(convidado.v.id),
    convidado: textoSeguro_(convidado.v.nome, LIMITES.NOME),
    recado: textoSeguro_(dados.recado, LIMITES.RECADO),
    conferido: false,
    cancelado: false
  }]);
  return { presenteId: p.id, restantes: p.qtd - ocupados - 1, link: modo === MODO.COMPRAR ? p.link : '', repetido: false };
}
