// Ambiente comum dos testes: banco em memória e .env fictício.
// O `node --test` roda cada arquivo *.test.js num processo separado, então cada arquivo tem o seu banco.
process.env.NODE_ENV = 'test';
process.env.DB_ARQUIVO = ':memory:';
process.env.TRUST_PROXY = '1'; // os testes mandam um X-Forwarded-For diferente por pedido (ver `ip()`)
process.env.ADMIN_TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
process.env.RSVP_PRAZO = '2099-12-31T23:59:59-03:00';
process.env.PIX_CHAVE = '123e4567-e12b-12d1-a456-426655440000';
process.env.PIX_NOME = 'Millena e Leonardo';
process.env.PIX_CIDADE = 'Jaguaquara';
process.env.PIX_BANCO = 'Banco Teste';
process.env.ENDERECO_ENTREGA = 'Rua Teste, 1';

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

let n = 0;
/** Um IP diferente por pedido, para o limite por IP não interferir nos testes. */
const ip = () => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n++ & 255}`;

const api = {
  get: (url, ipFixo) => request(app).get(url).set('X-Forwarded-For', ipFixo || ip()),
  post: (url, corpo, ipFixo) => request(app).post(url).set('X-Forwarded-For', ipFixo || ip()).send(corpo)
};

const TOKEN = process.env.ADMIN_TOKEN;
const admin = {
  get: url => request(app).get('/api/admin' + url).set('X-Forwarded-For', ip()).set('Authorization', 'Bearer ' + TOKEN),
  post: (url, corpo) => request(app).post('/api/admin' + url).set('X-Forwarded-For', ip()).set('Authorization', 'Bearer ' + TOKEN).send(corpo),
  patch: (url, corpo) => request(app).patch('/api/admin' + url).set('X-Forwarded-For', ip()).set('Authorization', 'Bearer ' + TOKEN).send(corpo),
  delete: url => request(app).delete('/api/admin' + url).set('X-Forwarded-For', ip()).set('Authorization', 'Bearer ' + TOKEN),
  csv: texto => request(app).post('/api/admin/importar').set('X-Forwarded-For', ip()).set('Authorization', 'Bearer ' + TOKEN).set('Content-Type', 'text/csv; charset=utf-8').send(texto)
};

/** Apaga todos os dados (a estrutura das tabelas fica). */
function limpar() {
  db.exec('DELETE FROM escolhas; DELETE FROM presentes; DELETE FROM historico_respostas; DELETE FROM convidados; DELETE FROM convites;');
}

/** Convites de exemplo (mesmos de data/convidados-exemplo.csv). */
const CSV_EXEMPLO = [
  'convite,nome',
  'C001,Ana Beatriz Souza',
  'C001,Pedro Henrique Souza',
  'C002,João Santos Lima',
  'C003,João Santos Pereira',
  'C003,Luiza Pereira',
  'C004,Carla Mendes',
  'C004,Rafael Mendes'
].join('\n');

function presente(campos) {
  const p = Object.assign({ nome: 'Presente', valor: 10000, quantidade: 1, ativo: 1 }, campos);
  const r = db.prepare('INSERT INTO presentes (nome, valor, quantidade, link_loja, ativo) VALUES (?, ?, ?, ?, ?)')
    .run(p.nome, p.valor, p.quantidade, p.link_loja || null, p.ativo);
  return Number(r.lastInsertRowid);
}

module.exports = { app, db, api, admin, TOKEN, ip, limpar, CSV_EXEMPLO, presente, request };
