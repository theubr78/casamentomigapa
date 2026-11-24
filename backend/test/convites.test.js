const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, admin, limpar, CSV_EXEMPLO } = require('./ajuda');

const buscar = nome => api.get('/api/convites/busca?nome=' + encodeURIComponent(nome));

beforeEach(async () => {
  limpar();
  await admin.csv(CSV_EXEMPLO).expect(200);
});

describe('busca de convite', () => {
  test('nome exato', async () => {
    const r = await buscar('João Santos Lima').expect(200);
    assert.equal(r.body.tipo, 'ok');
    assert.deepEqual(r.body.convite.convidados.map(p => p.nome), ['João Santos Lima']);
    assert.equal(r.body.convite.resposta, null);
  });

  test('parcial: primeiro nome + sobrenome', async () => {
    const r = await buscar('Ana Souza').expect(200);
    assert.equal(r.body.tipo, 'ok');
    assert.deepEqual(r.body.convite.convidados.map(p => p.nome), ['Ana Beatriz Souza', 'Pedro Henrique Souza']);
  });

  test('ignora acentos, maiúsculas e espaços extras', async () => {
    for (const nome of ['joao santos lima', 'JOÃO   SANTOS  LIMA', '  João Santos Lima ']) {
      const r = await buscar(nome).expect(200);
      assert.equal(r.body.tipo, 'ok', nome);
    }
  });

  test('ambíguo: mesmo nome em dois convites', async () => {
    const r = await buscar('Joao Santos').expect(200);
    assert.deepEqual(r.body, { tipo: 'ambiguo' });
  });

  test('curto: menos de duas palavras', async () => {
    for (const nome of ['Ana', '', '   ']) {
      const r = await buscar(nome).expect(200);
      assert.deepEqual(r.body, { tipo: 'curto' }, JSON.stringify(nome));
    }
  });

  test('inexistente', async () => {
    const r = await buscar('Fulano Silva').expect(200);
    assert.deepEqual(r.body, { tipo: 'nao' });
  });

  test('não devolve a lista inteira nem dados internos', async () => {
    const r = await buscar('Ana Souza').expect(200);
    const c = r.body.convite;
    assert.deepEqual(Object.keys(c).sort(), ['codigo', 'convidados', 'resposta']);
    assert.ok(c.codigo.length >= 12);
    c.convidados.forEach(p => assert.deepEqual(Object.keys(p).sort(), ['id', 'nome']));
  });
});

describe('resposta do convite', () => {
  async function conviteDe(nome) { return (await buscar(nome)).body.convite; }
  const responder = (c, itens) => api.post(`/api/convites/${c.codigo}/resposta`, { itens });

  test('grava e aparece como já respondido na próxima busca', async () => {
    const c = await conviteDe('Ana Souza');
    const r = await responder(c, c.convidados.map((p, i) => ({ id: p.id, status: i ? 'nao' : 'vai' }))).expect(200);
    assert.deepEqual(r.body.itens.map(i => i.status), ['vai', 'nao']);
    const depois = await conviteDe('Ana Souza');
    assert.ok(depois.resposta.data);
    assert.deepEqual(depois.resposta.itens.map(i => [i.nome, i.status]), [['Ana Beatriz Souza', 'vai'], ['Pedro Henrique Souza', 'nao']]);
  });

  test('alterar a resposta', async () => {
    const c = await conviteDe('Ana Souza');
    await responder(c, c.convidados.map(p => ({ id: p.id, status: 'vai' }))).expect(200);
    const r = await responder(c, c.convidados.map(p => ({ id: p.id, status: 'nao' }))).expect(200);
    assert.deepEqual(r.body.itens.map(i => i.status), ['nao', 'nao']);
    const hist = await admin.get('/convites').expect(200);
    const conv = hist.body.find(k => k.rotulo === 'C001');
    const h = await admin.get(`/convites/${conv.id}/historico`).expect(200);
    assert.equal(h.body.length, 2, 'as duas respostas ficam no histórico');
  });

  test('itens incompletos', async () => {
    const c = await conviteDe('Ana Souza');
    const r = await responder(c, [{ id: c.convidados[0].id, status: 'vai' }]).expect(400);
    assert.equal(r.body.erro, 'itens_invalidos');
  });

  test('status inválido', async () => {
    const c = await conviteDe('Ana Souza');
    await responder(c, c.convidados.map(p => ({ id: p.id, status: 'talvez' }))).expect(400);
  });

  test('pessoa de outro convite não entra', async () => {
    const c = await conviteDe('Ana Souza');
    const outro = await conviteDe('Carla Mendes');
    await responder(c, [{ id: c.convidados[0].id, status: 'vai' }, { id: outro.convidados[0].id, status: 'vai' }]).expect(400);
  });

  test('código inexistente', async () => {
    await api.post('/api/convites/naoexiste/resposta', { itens: [] }).expect(404);
  });

  test('prazo encerrado bloqueia busca e resposta', async () => {
    const c = await conviteDe('Ana Souza');
    const antes = process.env.RSVP_PRAZO;
    process.env.RSVP_PRAZO = '2020-01-01T00:00:00-03:00';
    try {
      assert.equal((await buscar('Ana Souza').expect(403)).body.erro, 'prazo_encerrado');
      await responder(c, c.convidados.map(p => ({ id: p.id, status: 'vai' }))).expect(403);
      const cfg = await api.get('/api/config').expect(200);
      assert.equal(cfg.body.encerrado, true);
    } finally { process.env.RSVP_PRAZO = antes; }
  });
});
