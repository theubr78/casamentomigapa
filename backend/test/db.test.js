// Migrações: um banco criado pela versão antiga do código (user_version 0) é atualizado sem perder dados.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'casamento-')), 'antigo.db');

// Estrutura como o código antigo criava (sem user_version), com uma pessoa duplicada pelo importador antigo
const antigo = new Database(arquivo);
antigo.exec(`
  CREATE TABLE convites (id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, rotulo TEXT NOT NULL, observacao TEXT,
    respondido_em TEXT, criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE TABLE convidados (id INTEGER PRIMARY KEY, convite_id INTEGER NOT NULL REFERENCES convites(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, nome_norm TEXT NOT NULL, status TEXT CHECK (status IN ('vai','nao')), atualizado_em TEXT);
  INSERT INTO convites (id, codigo, rotulo) VALUES (1, 'abc123abc123', 'Família Ávila');
  INSERT INTO convidados (convite_id, nome, nome_norm, status) VALUES
    (1, 'Joana Ávila', 'joana avila', NULL),
    (1, 'Joana Ávila', 'joana avila', 'vai'),
    (1, 'Pedro Ávila', 'pedro avila', NULL);
  CREATE TABLE presentes (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, valor INTEGER NOT NULL CHECK (valor > 0),
    imagem TEXT, link_loja TEXT, quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 0), ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  CREATE TABLE escolhas (id INTEGER PRIMARY KEY, presente_id INTEGER REFERENCES presentes(id) ON DELETE SET NULL,
    modo TEXT NOT NULL CHECK (modo IN ('comprar','pix')), nome TEXT NOT NULL, contato TEXT, mensagem TEXT,
    conferido INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
  INSERT INTO presentes (id, nome, valor) VALUES (7, 'Cafeteira', 32000);
  INSERT INTO escolhas (presente_id, modo, nome) VALUES (7, 'pix', 'Tia Lúcia');
`);
antigo.close();

test('banco antigo é migrado e mantém os dados', () => {
  process.env.DB_ARQUIVO = arquivo;
  const avisos = [];
  const warn = console.warn; console.warn = m => avisos.push(m);
  const log = console.log; console.log = () => {};
  let db;
  try { db = require('../src/db'); } finally { console.warn = warn; console.log = log; }

  assert.ok(db.versao() >= 2);
  const pessoas = db.prepare('SELECT nome, status FROM convidados ORDER BY id').all();
  assert.deepEqual(pessoas, [{ nome: 'Joana Ávila', status: 'vai' }, { nome: 'Pedro Ávila', status: null }], 'a duplicata sem resposta saiu; a com resposta ficou');
  assert.ok(avisos.some(a => /Joana Ávila/.test(a)));
  // escolhas antigas recebem o nome e o valor do presente
  assert.deepEqual(db.prepare('SELECT presente_nome, presente_valor FROM escolhas').get(), { presente_nome: 'Cafeteira', presente_valor: 32000 });
  assert.ok(db.versao() >= 3);
  // a duplicata não volta
  assert.throws(() => db.prepare('INSERT INTO convidados (convite_id, nome, nome_norm) VALUES (1, ?, ?)').run('joana avila', 'joana avila'), /UNIQUE/);
  db.close();
});
