const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { api, db, presente } = require('./ajuda');
const { payloadPix, crc16 } = require('../src/pix');

// CRC-16/CCITT-FALSE escrito de outro jeito (sobre os bytes, com tabela), para conferir o do código
const TABELA = Array.from({ length: 256 }, (_, n) => { let c = n << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1; return c & 0xFFFF; });
const crcIndependente = s => { let c = 0xFFFF; for (const b of Buffer.from(s, 'utf8')) c = ((c << 8) ^ TABELA[((c >> 8) ^ b) & 0xFF]) & 0xFFFF; return c.toString(16).toUpperCase().padStart(4, '0'); };

// Lê o payload como lista de [id, valor], conferindo os tamanhos
function tlv(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(n) && i + 4 + n <= s.length, `tamanho inválido no campo ${id}`);
    out.push([id, s.slice(i + 4, i + 4 + n)]); i += 4 + n;
  }
  return Object.fromEntries(out);
}

const EVP = '123e4567-e12b-12d1-a456-426655440000';

describe('BR Code (Pix copia e cola)', () => {
  test('CRC16 bate com o exemplo do Manual do BR Code (Banco Central)', () => {
    const exemplo = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    assert.equal(crc16(exemplo), '1D3D');
    assert.equal(crcIndependente(exemplo), '1D3D');
  });

  test('payload completo com valores conhecidos', () => {
    const p = payloadPix({ chave: EVP, nome: 'Millena e Leonardo', cidade: 'Jaguaquara', valorCentavos: 45000, txid: 'PRESENTE1' });
    const esperadoSemCrc =
      '000201' +
      '2658' + '0014br.gov.bcb.pix' + '0136' + EVP +
      '52040000' + '5303986' + '5406450.00' + '5802BR' +
      '5918MILLENA E LEONARDO' + '6010JAGUAQUARA' +
      '6213' + '0509PRESENTE1' +
      '6304';
    assert.equal(p, esperadoSemCrc + crcIndependente(esperadoSemCrc));
  });

  test('sem acentos nem símbolos, só ASCII; nome até 25 e cidade até 15', () => {
    const p = payloadPix({ chave: EVP, nome: 'Millena Conceição Søren – Leão de Araújo', cidade: 'São Gonçalo dos Campos', valorCentavos: 100 });
    assert.match(p, /^[\x20-\x7E]+$/);
    const c = tlv(p);
    assert.equal(c['59'], 'MILLENA CONCEICAO S REN L');
    assert.ok(c['59'].length <= 25);
    assert.equal(c['60'], 'SAO GONCALO DOS');
    assert.equal(c['63'], crcIndependente(p.slice(0, -4)));
  });

  test('valores: centavos com 2 casas e sem separador de milhar', () => {
    assert.equal(tlv(payloadPix({ chave: EVP, nome: 'M', cidade: 'J', valorCentavos: 1 }))['54'], '0.01');
    assert.equal(tlv(payloadPix({ chave: EVP, nome: 'M', cidade: 'J', valorCentavos: 123456 }))['54'], '1234.56');
  });

  test('valor inválido é recusado', () => {
    for (const v of [0, -100, 12.5, NaN]) assert.throws(() => payloadPix({ chave: EVP, nome: 'M', cidade: 'J', valorCentavos: v }), /inválido/, String(v));
  });

  test('txid: só letras e números; vazio vira ***', () => {
    assert.equal(tlv(payloadPix({ chave: EVP, nome: 'M', cidade: 'J', txid: 'presente-12 ç' }))['62'], '0511presente12c');
    assert.equal(tlv(payloadPix({ chave: EVP, nome: 'M', cidade: 'J' }))['62'], '0503***');
  });

  test('chave CPF formatada entra só com dígitos', () => {
    const conta = tlv(payloadPix({ chave: '529.982.247-25', nome: 'M', cidade: 'J' }))['26'];
    assert.equal(conta, '0014br.gov.bcb.pix011152998224725');
  });

  test('campo acima de 99 caracteres é recusado em vez de gerar código corrompido', () => {
    const email = 'x'.repeat(60) + '@exemplo.com.br';
    assert.throws(() => payloadPix({ chave: email, nome: 'M', cidade: 'J', descricao: 'Presente de casamento Millena e Leonardo' }), /1 a 99/);
  });

  test('nome só com símbolos é recusado', () => {
    assert.throws(() => payloadPix({ chave: EVP, nome: '—', cidade: 'J' }), /PIX_NOME/);
  });
});

describe('GET /api/presentes/:id/pix', () => {
  test('QR com o valor do presente e o recebedor', async () => {
    const id = presente({ nome: 'Cafeteira', valor: 32000 });
    const r = await api.get(`/api/presentes/${id}/pix`).expect(200);
    const c = tlv(r.body.payload);
    assert.equal(c['54'], '320.00');
    const txid = 'PRESENTE' + id;
    assert.equal(c['62'], '05' + String(txid.length).padStart(2, '0') + txid);
    assert.match(r.body.qr, /^data:image\/png;base64,/);
    assert.equal(r.body.recebedor, 'Millena e Leonardo · Banco Teste');
  });

  test('presente inativo ou inexistente → 404', async () => {
    const id = presente({ ativo: 0 });
    await api.get(`/api/presentes/${id}/pix`).expect(404);
    await api.get('/api/presentes/999999/pix').expect(404);
    db.prepare('DELETE FROM presentes').run();
  });
});
