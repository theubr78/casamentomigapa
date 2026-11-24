// Cliente da API do Apps Script: assinatura, erros e respostas inesperadas do Google.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { chamarPlanilha, montarEnvelope, assinar, ErroPlanilha } = require('../lib/planilha/cliente');

const opcoes = extra => Object.assign({ url: 'https://script.exemplo/exec', segredo: 'segredo-de-teste-com-mais-de-32-caracteres' }, extra);
const resposta = (corpo, status = 200) => async () => ({ status, text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });

describe('cliente do Apps Script', () => {
  test('envelope assinado: corpo com ts, ação e dados; assinatura HMAC-SHA256 hex', () => {
    const env = JSON.parse(montarEnvelope('responder', { a: 1 }, 'chave', 1700000000000));
    assert.deepEqual(JSON.parse(env.corpo), { ts: 1700000000000, acao: 'responder', dados: { a: 1 } });
    assert.equal(env.assinatura, assinar(env.corpo, 'chave'));
    assert.match(env.assinatura, /^[0-9a-f]{64}$/);
  });

  test('ok → devolve os dados; manda POST text/plain e segue o redirecionamento do Google', async () => {
    let pedido;
    const dados = await chamarPlanilha('saude', {}, opcoes({ fetch: async (url, o) => { pedido = o; return resposta({ ok: true, dados: { versao: '1' } })(); } }));
    assert.deepEqual(dados, { versao: '1' });
    assert.equal(pedido.method, 'POST');
    assert.equal(pedido.redirect, 'follow');
    assert.match(pedido.headers['Content-Type'], /text\/plain/);
  });

  test('erro do Apps Script → ErroPlanilha com o mesmo código e mensagem', async () => {
    await assert.rejects(
      chamarPlanilha('escolher', {}, opcoes({ fetch: resposta({ ok: false, erro: 'esgotado', mensagem: 'Alguém acabou de escolher.' }) })),
      e => e instanceof ErroPlanilha && e.codigo === 'esgotado' && e.message === 'Alguém acabou de escolher.'
    );
  });

  test('página HTML de erro do Google → indisponivel', async () => {
    await assert.rejects(chamarPlanilha('saude', {}, opcoes({ fetch: resposta('<html>Service invoked too many times</html>') })), { codigo: 'indisponivel' });
  });

  test('rede fora ou demora demais → indisponivel', async () => {
    await assert.rejects(chamarPlanilha('saude', {}, opcoes({ fetch: async () => { throw new TypeError('fetch failed'); } })), { codigo: 'indisponivel' });
    const lento = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' }))));
    await assert.rejects(chamarPlanilha('saude', {}, opcoes({ fetch: lento, tempoLimiteMs: 50 })), e => e.codigo === 'indisponivel' && /demorou/.test(e.message));
  });

  test('sem URL ou segredo → nao_configurado', async () => {
    await assert.rejects(chamarPlanilha('saude', {}, { url: '', segredo: '' }), { codigo: 'nao_configurado' });
  });
});
