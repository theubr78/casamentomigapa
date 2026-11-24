const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, admin, limpar, presente } = require('./ajuda');

const escolher = (id, corpo) => api.post(`/api/presentes/${id}/escolhas`, corpo);
const lista = async () => (await api.get('/api/presentes').expect(200)).body;

beforeEach(() => limpar());

describe('lista pública de presentes', () => {
  test('só ativos, sem o link da loja (ele só aparece depois de reservar)', async () => {
    presente({ nome: 'Ativo', link_loja: 'https://loja.exemplo/x' });
    presente({ nome: 'Inativo', ativo: 0 });
    const l = await lista();
    assert.deepEqual(l.map(p => p.nome), ['Ativo']);
    assert.equal(l[0].link_loja, undefined);
    assert.equal(l[0].linkLoja, undefined);
  });
});

describe('vou comprar (reserva)', () => {
  test('reserva 1 unidade e devolve loja e endereço', async () => {
    const id = presente({ nome: 'Toalhas', quantidade: 2, link_loja: 'https://loja.exemplo/toalhas' });
    const r = await escolher(id, { modo: 'comprar', nome: 'Ana Souza', mensagem: 'Felicidades!' }).expect(201);
    assert.deepEqual(r.body, { ok: true, linkLoja: 'https://loja.exemplo/toalhas', entrega: 'Rua Teste, 1', disponiveis: 1 });
    assert.equal((await lista())[0].disponiveis, 1);
  });

  test('esgotado → 409 e o site mostra "Já escolhido"', async () => {
    const id = presente({ quantidade: 1 });
    await escolher(id, { modo: 'comprar', nome: 'Ana Souza' }).expect(201);
    const r = await escolher(id, { modo: 'comprar', nome: 'Pedro Souza' }).expect(409);
    assert.equal(r.body.erro, 'esgotado');
    assert.equal((await lista())[0].disponiveis, 0);
  });

  test('corrida: 10 pedidos ao mesmo tempo pela última unidade → só 1 consegue', async () => {
    const id = presente({ quantidade: 1 });
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => escolher(id, { modo: 'comprar', nome: 'Pessoa ' + i })));
    const codigos = rs.map(r => r.status).sort();
    assert.deepEqual(codigos, [201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    const esc = (await admin.get('/escolhas').expect(200)).body;
    assert.equal(esc.filter(e => e.modo === 'comprar').length, 1);
  });

  test('presente só Pix (quantidade 0) não aceita reserva', async () => {
    const id = presente({ quantidade: 0 });
    await escolher(id, { modo: 'comprar', nome: 'Ana Souza' }).expect(409);
  });

  test('nome obrigatório e modo válido', async () => {
    const id = presente();
    assert.equal((await escolher(id, { modo: 'comprar', nome: ' a ' }).expect(400)).body.erro, 'nome_obrigatorio');
    assert.equal((await escolher(id, { modo: 'cartao', nome: 'Ana Souza' }).expect(400)).body.erro, 'modo_invalido');
  });

  test('presente inativo ou inexistente → 404', async () => {
    const id = presente({ ativo: 0 });
    await escolher(id, { modo: 'comprar', nome: 'Ana Souza' }).expect(404);
    await escolher(99999, { modo: 'pix', nome: 'Ana Souza' }).expect(404);
  });

  test('excluir a reserva no painel libera o presente', async () => {
    const id = presente({ quantidade: 1 });
    await escolher(id, { modo: 'comprar', nome: 'Ana Souza' }).expect(201);
    const [e] = (await admin.get('/escolhas').expect(200)).body;
    await admin.delete('/escolhas/' + e.id).expect(204);
    assert.equal((await lista())[0].disponiveis, 1);
  });
});

describe('aviso de Pix', () => {
  test('não reserva e pode repetir', async () => {
    const id = presente({ quantidade: 0, valor: 25000 });
    await escolher(id, { modo: 'pix', nome: 'Tia Lúcia', mensagem: 'Parabéns!' }).expect(201);
    await escolher(id, { modo: 'pix', nome: 'Tio Zé' }).expect(201);
    const r = (await admin.get('/resumo').expect(200)).body;
    assert.equal(r.presentesPix, 2);
    assert.equal(r.valorPixPrometido, 50000);
  });

  test('excluir o presente não apaga de qual presente era a escolha', async () => {
    const id = presente({ nome: 'Jantar na lua de mel', valor: 25000, quantidade: 0 });
    await escolher(id, { modo: 'pix', nome: 'Tia Lúcia' }).expect(201);
    await admin.patch('/presentes/' + id, { valor: 99900 }).expect(200);
    await admin.delete('/presentes/' + id).expect(204);
    const [e] = (await admin.get('/escolhas').expect(200)).body;
    assert.equal(e.presente, 'Jantar na lua de mel');
    assert.equal(e.valor, 25000, 'vale o valor de quando o convidado escolheu');
    assert.equal((await admin.get('/resumo').expect(200)).body.valorPixPrometido, 25000);
  });
});
