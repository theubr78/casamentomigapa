const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { admin, limpar, request, app, TOKEN } = require('./ajuda');

const BOM = String.fromCharCode(0xFEFF);
const convites = async () => (await admin.get('/convites').expect(200)).body;
const resumo = cs => cs.map(c => c.rotulo + '=' + c.convidados.map(p => p.nome).join('+')).sort();

beforeEach(() => limpar());

describe('importar CSV', () => {
  test('ponto e vírgula, BOM, acentos e cabeçalho', async () => {
    const r = await admin.csv(BOM + 'convite;nome\r\nFamília Ávila;Joana Ávila\r\nFamília Ávila;Pedro Conceição\r\n').expect(200);
    assert.equal(r.body.convitesCriados, 1);
    assert.equal(r.body.convidadosAdicionados, 2);
    assert.deepEqual(resumo(await convites()), ['Família Ávila=Joana Ávila+Pedro Conceição']);
  });

  test('vírgula, sem cabeçalho, campo entre aspas com vírgula', async () => {
    await admin.csv('"Silva, Maria e José",Maria Silva\n"Silva, Maria e José",José Silva\n').expect(200);
    assert.deepEqual(resumo(await convites()), ['Silva, Maria e José=Maria Silva+José Silva']);
  });

  test('linhas repetidas no mesmo arquivo não duplicam', async () => {
    const r = await admin.csv('convite;nome\nC1;Joana Ávila\nC1;Joana Ávila\nC1;joana avila\n').expect(200);
    assert.equal(r.body.convidadosAdicionados, 1);
    assert.equal(r.body.repetidosIgnorados, 2);
    assert.deepEqual(resumo(await convites()), ['C1=Joana Ávila']);
  });

  test('rótulo com acento/maiúscula diferente é o mesmo convite', async () => {
    await admin.csv('Família Ávila;Joana\nfamilia avila;Pedro\n').expect(200);
    const cs = await convites();
    assert.equal(cs.length, 1);
    assert.deepEqual(cs[0].convidados.map(p => p.nome), ['Joana', 'Pedro']);
  });

  test('reimportar não duplica e acrescenta só o que é novo', async () => {
    await admin.csv('C1;Ana Souza\nC1;Pedro Souza\n').expect(200);
    const r = await admin.csv('C1;Ana Souza\nC1;Pedro Souza\nC1;Luiza Souza\n').expect(200);
    assert.equal(r.body.convitesCriados, 0);
    assert.equal(r.body.convidadosAdicionados, 1);
    assert.deepEqual(resumo(await convites()), ['C1=Ana Souza+Pedro Souza+Luiza Souza']);
  });

  test('informa linhas sem as duas colunas', async () => {
    const r = await admin.csv('convite;nome\nC1;Ana Souza\nsó uma coluna\n;Sem Convite\nC2;\n').expect(200);
    assert.deepEqual(r.body.linhasIgnoradas, [3, 4, 5]);
  });

  test('avisa nome idêntico em outro convite (a busca daria ambíguo)', async () => {
    await admin.csv('C1;João Santos\n').expect(200);
    const r = await admin.csv('C2;João Santos\n').expect(200);
    assert.deepEqual(r.body.emOutroConvite, [{ nome: 'João Santos', convite: 'C1' }]);
  });

  test('CSV vazio', async () => {
    const r = await admin.csv('   ').expect(400);
    assert.equal(r.body.erro, 'csv_vazio');
  });
});

describe('exportar CSV', () => {
  test('abre no Excel: BOM, ponto e vírgula, status em português, data de Brasília', async () => {
    await admin.csv('Família Ávila;Joana Ávila\nFamília Ávila;=1+1\n').expect(200);
    const cs = await convites();
    await admin.patch('/convidados/' + cs[0].convidados[0].id, { status: 'vai' }).expect(200);

    const r = await request(app).get('/api/admin/exportar.csv').set('Authorization', 'Bearer ' + TOKEN)
      .buffer(true).parse((res, cb) => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); })
      .expect(200);
    assert.match(r.headers['content-type'], /text\/csv; charset=utf-8/);
    assert.match(r.headers['content-disposition'], /attachment; filename="convidados-\d{4}-\d{2}-\d{2}\.csv"/);
    assert.deepEqual([...r.body.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'começa com BOM UTF-8');

    const linhas = r.body.toString('utf8').slice(1).split('\r\n');
    assert.equal(linhas[0], 'convite;nome;status;respondido_em;observacao');
    const [rotulo, nome, status, data] = linhas[1].split(';').map(s => s.replace(/^"|"$/g, ''));
    assert.deepEqual([rotulo, nome, status], ['Família Ávila', 'Joana Ávila', 'Vai']);
    assert.match(data, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    assert.ok(linhas[2].includes(`"'=1+1"`), 'célula que começa com = não vira fórmula');
    assert.ok(linhas[2].includes('"Pendente"'));
  });

  test('exportar e reimportar o mesmo arquivo não duplica', async () => {
    await admin.csv('C1;Ana Souza\nC1;Pedro Souza\n').expect(200);
    const csv = (await admin.get('/exportar.csv').expect(200)).text;
    const r = await admin.csv(csv).expect(200);
    assert.equal(r.body.convidadosAdicionados, 0);
  });
});

describe('convidados no painel', () => {
  test('adicionar a mesma pessoa duas vezes no convite → 409', async () => {
    await admin.csv('C1;Ana Souza\n').expect(200);
    const [c] = await convites();
    const r = await admin.post(`/convites/${c.id}/convidados`, { nome: 'ana  SOUZA' }).expect(409);
    assert.equal(r.body.erro, 'ja_existe');
  });

  test('criar convite com nomes repetidos guarda um só', async () => {
    await admin.post('/convites', { rotulo: 'C9', nomes: ['Ana Souza', 'Ana Souza', ' '] }).expect(201);
    assert.deepEqual(resumo(await convites()), ['C9=Ana Souza']);
  });
});
