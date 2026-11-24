const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, admin, limpar, request, app, ip } = require('./ajuda');

beforeEach(() => limpar());

describe('erros de entrada respondem 400/413, nunca 500', () => {
  test('JSON malformado → 400', async () => {
    const r = await request(app).post('/api/convites/x/resposta').set('X-Forwarded-For', ip())
      .set('Content-Type', 'application/json').send('{itens:').expect(400);
    assert.equal(r.body.erro, 'json_invalido');
    assert.ok(r.body.mensagem);
  });

  test('corpo acima de 100 KB → 413', async () => {
    const r = await api.post('/api/presentes/1/escolhas', { modo: 'pix', nome: 'A B', mensagem: 'x'.repeat(120 * 1024) }).expect(413);
    assert.equal(r.body.erro, 'muito_grande');
  });

  test('itens com null ou texto → 400', async () => {
    await admin.post('/convites', { rotulo: 'C1', nomes: ['Ana Souza'] }).expect(201);
    const c = (await api.get('/api/convites/busca?nome=Ana%20Souza')).body.convite;
    for (const itens of [[null], ['abc'], 'abc', { id: 1 }]) {
      await api.post(`/api/convites/${c.codigo}/resposta`, { itens }).expect(400);
    }
  });

  test('ids não numéricos → 404', async () => {
    await admin.patch('/presentes/abc', { nome: 'X' }).expect(404);
    await admin.delete('/convidados/1e3').expect(404);
  });
});

describe('presentes no painel', () => {
  const criar = campos => admin.post('/presentes', Object.assign({ nome: 'Cafeteira', valor: 32000 }, campos));

  test('válido: link https e foto em assets/', async () => {
    const r = await criar({ linkLoja: 'https://loja.exemplo/cafeteira', imagem: 'assets/presentes/cafeteira.jpg', quantidade: '2', ordem: '3' }).expect(201);
    assert.equal(r.body.link_loja, 'https://loja.exemplo/cafeteira');
    assert.equal(r.body.imagem, 'assets/presentes/cafeteira.jpg');
    assert.equal(r.body.quantidade, 2);
    assert.equal(r.body.ordem, 3);
  });

  test('link e foto com javascript:, data: ou http: são recusados', async () => {
    for (const campos of [{ linkLoja: 'javascript:alert(1)' }, { linkLoja: 'data:text/html,oi' }, { imagem: 'javascript:alert(1)' },
      { imagem: 'http://site.exemplo/f.jpg' }, { imagem: 'assets/../admin/index.html' }, { linkLoja: 'loja.com.br' }]) {
      const r = await criar(campos).expect(400);
      assert.match(r.body.mensagem, /https:\/\//, JSON.stringify(campos));
    }
  });

  test('valor vazio, zero, texto ou com casas → 400', async () => {
    for (const valor of [null, '', 0, 'abc', 12.5, 10000001]) {
      const r = await criar({ valor }).expect(400);
      assert.match(r.body.mensagem, /Valor inválido/, JSON.stringify(valor));
    }
  });

  test('quantidade vazia não vira "só Pix" sem aviso', async () => {
    const r = await criar({ quantidade: '' }).expect(400);
    assert.match(r.body.mensagem, /Quantidade/);
    const ok = (await criar({}).expect(201)).body;
    await admin.patch('/presentes/' + ok.id, { quantidade: '' }).expect(400);
    await admin.patch('/presentes/' + ok.id, { quantidade: 'abc' }).expect(400);
    assert.equal((await admin.patch('/presentes/' + ok.id, { quantidade: '0' }).expect(200)).body.quantidade, 0);
  });

  test('sem nome, descrição como objeto, ativo como texto → 400', async () => {
    await criar({ nome: '  ' }).expect(400);
    await criar({ descricao: { a: 1 } }).expect(400);
    await criar({ ativo: 'sim' }).expect(400);
  });

  test('PATCH parcial mantém os outros campos e limpa o link enviado vazio', async () => {
    const p = (await criar({ linkLoja: 'https://loja.exemplo/a', quantidade: 2 }).expect(201)).body;
    const r = (await admin.patch('/presentes/' + p.id, { linkLoja: '' }).expect(200)).body;
    assert.equal(r.link_loja, null);
    assert.equal(r.quantidade, 2);
    assert.equal(r.valor, 32000);
  });
});

describe('convites no painel', () => {
  test('nomes precisa ser uma lista', async () => {
    const r = await admin.post('/convites', { nomes: 'Ana Souza' }).expect(400);
    assert.match(r.body.mensagem, /um por linha/);
    assert.doesNotMatch(r.body.mensagem, /is not a function/);
  });

  test('convite sem nenhum nome → 400', async () => {
    await admin.post('/convites', { nomes: ['', ' '] }).expect(400);
  });

  test('conferido precisa ser verdadeiro ou falso', async () => {
    await admin.patch('/escolhas/1', { conferido: 'sim' }).expect(400);
  });
});

describe('"respondido" acompanha as mudanças no painel', () => {
  async function conviteRespondido() {
    await admin.post('/convites', { rotulo: 'C1', nomes: ['Ana Souza', 'Pedro Souza'] }).expect(201);
    const c = (await api.get('/api/convites/busca?nome=Ana%20Souza')).body.convite;
    await api.post(`/api/convites/${c.codigo}/resposta`, { itens: c.convidados.map(p => ({ id: p.id, status: 'vai' })) }).expect(200);
    return (await admin.get('/convites')).body[0];
  }

  test('adicionar alguém tira o "respondido"; remover essa pessoa devolve', async () => {
    const c = await conviteRespondido();
    assert.ok(c.respondido_em);
    const nova = (await admin.post(`/convites/${c.id}/convidados`, { nome: 'Luiza Souza' }).expect(201)).body;
    assert.equal((await admin.get('/convites')).body[0].respondido_em, null);
    assert.equal((await admin.get('/resumo')).body.convitesRespondidos, 0);
    await admin.delete('/convidados/' + nova.id).expect(204);
    assert.ok((await admin.get('/convites')).body[0].respondido_em);
  });
});
