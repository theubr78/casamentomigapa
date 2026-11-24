// Banco SQLite (arquivo único). A estrutura é criada e atualizada por migrações numeradas.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Caminho relativo à pasta backend/ (não à pasta de onde o comando foi rodado)
const arquivo = process.env.DB_ARQUIVO === ':memory:'
  ? ':memory:'
  : path.resolve(__dirname, '..', process.env.DB_ARQUIVO || path.join('data', 'casamento.db'));
if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });

const db = new Database(arquivo);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/*
 * Migrações: cada item leva o banco da versão N para N+1 (PRAGMA user_version).
 * Para mudar a estrutura: ACRESCENTE um item no fim. Nunca edite nem remova um item já publicado,
 * porque bancos que já rodaram aquela versão não rodam de novo.
 */
const migracoes = [
  // 1 — estrutura original (bancos criados antes das migrações já a têm: IF NOT EXISTS)
  `
  CREATE TABLE IF NOT EXISTS convites (
    id            INTEGER PRIMARY KEY,
    codigo        TEXT NOT NULL UNIQUE,          -- identificador público (aleatório)
    rotulo        TEXT NOT NULL,                 -- ex.: "Família Souza" ou "C001"
    observacao    TEXT,
    respondido_em TEXT,                          -- ISO 8601, null = sem resposta
    criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS convidados (
    id            INTEGER PRIMARY KEY,
    convite_id    INTEGER NOT NULL REFERENCES convites(id) ON DELETE CASCADE,
    nome          TEXT NOT NULL,
    nome_norm     TEXT NOT NULL,                 -- sem acento, minúsculo, para a busca
    status        TEXT CHECK (status IN ('vai','nao')),
    atualizado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_convidados_convite ON convidados(convite_id);
  CREATE INDEX IF NOT EXISTS idx_convidados_norm ON convidados(nome_norm);

  -- Toda resposta enviada fica registrada (auditoria / "quem mudou o quê")
  CREATE TABLE IF NOT EXISTS historico_respostas (
    id         INTEGER PRIMARY KEY,
    convite_id INTEGER NOT NULL REFERENCES convites(id) ON DELETE CASCADE,
    itens_json TEXT NOT NULL,
    ip         TEXT,
    criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS presentes (
    id          INTEGER PRIMARY KEY,
    nome        TEXT NOT NULL,
    descricao   TEXT,
    valor       INTEGER NOT NULL CHECK (valor > 0), -- em centavos
    imagem      TEXT,                               -- caminho/URL da foto
    link_loja   TEXT,                               -- onde comprar (para quem prefere comprar)
    quantidade  INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 0), -- quantas unidades podem ser compradas
    ordem       INTEGER NOT NULL DEFAULT 0,
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- Cada vez que um convidado escolhe um presente:
  --   modo 'comprar' → reserva 1 unidade (vai comprar e entregar)
  --   modo 'pix'     → vai mandar o valor por Pix (não reserva)
  CREATE TABLE IF NOT EXISTS escolhas (
    id          INTEGER PRIMARY KEY,
    presente_id INTEGER REFERENCES presentes(id) ON DELETE SET NULL,
    modo        TEXT NOT NULL CHECK (modo IN ('comprar','pix')),
    nome        TEXT NOT NULL,
    contato     TEXT,                               -- WhatsApp/e-mail, opcional
    mensagem    TEXT,
    conferido   INTEGER NOT NULL DEFAULT 0,         -- noivos marcam: Pix caiu / presente chegou
    criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_escolhas_presente ON escolhas(presente_id);
  `,

  // 2 — a mesma pessoa não pode aparecer duas vezes no mesmo convite.
  //     Duplicatas antigas são juntadas: fica a linha que tem resposta (ou a mais antiga).
  d => {
    const dups = d.prepare(`SELECT convite_id, nome_norm FROM convidados GROUP BY convite_id, nome_norm HAVING COUNT(*) > 1`).all();
    for (const { convite_id, nome_norm } of dups) {
      const linhas = d.prepare(`SELECT id, nome FROM convidados WHERE convite_id = ? AND nome_norm = ?
        ORDER BY (status IS NULL), id`).all(convite_id, nome_norm);
      linhas.slice(1).forEach(l => d.prepare('DELETE FROM convidados WHERE id = ?').run(l.id));
      console.warn(`Migração 2: "${linhas[0].nome}" aparecia ${linhas.length}x no mesmo convite; ficou 1.`);
    }
    d.exec(`CREATE UNIQUE INDEX idx_convidados_unico ON convidados(convite_id, nome_norm);
            CREATE INDEX IF NOT EXISTS idx_historico_convite ON historico_respostas(convite_id);`);
  },

  // 3 — a escolha guarda o nome e o valor do presente no momento em que foi feita:
  //     excluir o presente ou mudar o preço depois não apaga "quem deu o quê, por quanto".
  `
  ALTER TABLE escolhas ADD COLUMN presente_nome TEXT;
  ALTER TABLE escolhas ADD COLUMN presente_valor INTEGER;
  UPDATE escolhas SET
    presente_nome  = (SELECT nome  FROM presentes p WHERE p.id = escolhas.presente_id),
    presente_valor = (SELECT valor FROM presentes p WHERE p.id = escolhas.presente_id);
  `
];

const versao = db.pragma('user_version', { simple: true });
for (let v = versao; v < migracoes.length; v++) {
  const m = migracoes[v];
  db.transaction(() => {
    if (typeof m === 'string') db.exec(m); else m(db);
    db.pragma(`user_version = ${v + 1}`);
  })();
  if (arquivo !== ':memory:') console.log(`Banco atualizado para a versão ${v + 1}.`);
}

// Unidades ainda disponíveis para "vou comprar"
db.sqlDisponiveis = `(p.quantidade - (SELECT COUNT(*) FROM escolhas e WHERE e.presente_id = p.id AND e.modo = 'comprar'))`;
db.arquivo = arquivo;
db.versao = () => db.pragma('user_version', { simple: true });

module.exports = db;
