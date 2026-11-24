const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { api, admin, CSV_EXEMPLO } = require('./ajuda');
const { trustProxy, lerPrazo, validar } = require('../src/config');
const { normalizarChave } = require('../src/pix');

describe('TRUST_PROXY', () => {
  test('vazio, 0 e false = sem proxy', () => {
    for (const v of [undefined, '', '0', 'false']) assert.equal(trustProxy(v), false, String(v));
  });
  test('número de proxies', () => assert.equal(trustProxy('1'), 1));
  test('lista de IPs/nomes', () => assert.equal(trustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8'));
  test('"true" é recusado (anularia o limite por IP)', () => assert.throws(() => trustProxy('true'), /número de proxies/));
  test('texto inválido é recusado em vez de derrubar o servidor', () => assert.throws(() => trustProxy('sim'), /inválido/));
});

describe('RSVP_PRAZO', () => {
  test('ISO com fuso', () => assert.equal(lerPrazo('2027-05-03T23:59:59-03:00').toISOString(), '2027-05-04T02:59:59.000Z'));
  test('padrão quando vazio', () => assert.equal(lerPrazo('').toISOString(), '2027-05-04T02:59:59.000Z'));
  test('"03/05/2027" é recusado (o JavaScript leria 5 de março)', () => assert.throws(() => lerPrazo('03/05/2027'), /inválido/));
  test('sem fuso é recusado (fecharia 3h antes no servidor em UTC)', () => assert.throws(() => lerPrazo('2027-05-03T23:59:59'), /fuso/));
  test('data impossível', () => assert.throws(() => lerPrazo('2027-13-45T10:00:00-03:00')));
});

describe('chave Pix', () => {
  test('CPF com pontuação vira só dígitos', () => assert.deepEqual(normalizarChave('529.982.247-25'), { tipo: 'CPF', chave: '52998224725' }));
  test('CNPJ com pontuação vira só dígitos', () => assert.deepEqual(normalizarChave('11.222.333/0001-81'), { tipo: 'CNPJ', chave: '11222333000181' }));
  test('telefone com máscara vira +55DDDNÚMERO', () => assert.deepEqual(normalizarChave('+55 (73) 99999-9999'), { tipo: 'telefone', chave: '+5573999999999' }));
  test('11 dígitos que não são CPF: pede o +55', () => assert.throws(() => normalizarChave('73999999999'), /\+5573999999999/));
  test('e-mail', () => assert.equal(normalizarChave(' noivos@exemplo.com.br ').chave, 'noivos@exemplo.com.br'));
  test('chave aleatória', () => assert.equal(normalizarChave('123e4567-e12b-12d1-a456-426655440000').tipo, 'chave aleatória'));
  test('formato desconhecido', () => assert.throws(() => normalizarChave('minha chave'), /não reconhecido/));
});

describe('validar(.env)', () => {
  test('erros juntos, para corrigir tudo de uma vez', () => {
    const r = validar({ TRUST_PROXY: 'true', RSVP_PRAZO: '03/05/2027', PIX_CHAVE: '123' });
    assert.equal(r.erros.length, 3);
  });
  test('produção sem TRUST_PROXY gera aviso', () => {
    const r = validar({ NODE_ENV: 'production', ADMIN_TOKEN: 'x'.repeat(20), PIX_CHAVE: '52998224725' });
    assert.equal(r.erros.length, 0);
    assert.ok(r.avisos.some(a => /TRUST_PROXY/.test(a)));
  });
});

describe('limite de tentativas da busca', () => {
  test('40 buscas por IP em 10 minutos; outro IP continua livre', async () => {
    await admin.csv(CSV_EXEMPLO).expect(200);
    const url = '/api/convites/busca?nome=Ana%20Souza';
    for (let i = 0; i < 40; i++) await api.get(url, '203.0.113.7').expect(200);
    const r = await api.get(url, '203.0.113.7').expect(429);
    assert.equal(r.body.erro, 'muitas_tentativas');
    await api.get(url, '203.0.113.8').expect(200);
  });
});
