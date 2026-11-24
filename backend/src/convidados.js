// Regras de negócio dos convites: normalização, busca por nome, resposta, importação.
const crypto = require('crypto');
const db = require('./db');
const { ErroEntrada } = require('./entrada');

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limparNome = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const novoCodigo = () => crypto.randomBytes(9).toString('base64url'); // 12 caracteres, não adivinhável
const agora = () => new Date().toISOString();

function conviteCompleto(conviteId) {
  const c = db.prepare('SELECT * FROM convites WHERE id = ?').get(conviteId);
  if (!c) return null;
  const pessoas = db.prepare('SELECT id, nome, status FROM convidados WHERE convite_id = ? ORDER BY id').all(conviteId);
  return {
    codigo: c.codigo,
    convidados: pessoas.map(p => ({ id: p.id, nome: p.nome })),
    resposta: c.respondido_em
      ? { data: c.respondido_em, itens: pessoas.filter(p => p.status).map(p => ({ id: p.id, nome: p.nome, status: p.status })) }
      : null
  };
}

/**
 * Busca o convite pelo nome digitado (mesma regra do design):
 *  - menos de 2 palavras → 'curto'
 *  - nome exato (sem acento/maiúscula) em 1 convite → 'ok'; em vários → 'ambiguo'
 *  - senão, parcial: 1º nome igual + todas as palavras digitadas presentes no nome
 */
function buscarPorNome(nomeDigitado) {
  const q = norm(nomeDigitado);
  const tk = q.split(' ').filter(Boolean);
  if (tk.length < 2) return { tipo: 'curto' };

  const todos = db.prepare('SELECT convite_id, nome_norm FROM convidados').all();
  const convitesDe = filtro => [...new Set(todos.filter(filtro).map(p => p.convite_id))];

  let ids = convitesDe(p => p.nome_norm === q);
  if (ids.length === 0) {
    ids = convitesDe(p => { const nt = p.nome_norm.split(' '); return nt[0] === tk[0] && tk.every(t => nt.includes(t)); });
  }
  if (ids.length === 1) return { tipo: 'ok', convite: conviteCompleto(ids[0]) };
  if (ids.length > 1) return { tipo: 'ambiguo' };
  return { tipo: 'nao' };
}

/** Grava a resposta de um convite. itens = [{ id, status: 'vai'|'nao' }] cobrindo TODOS os convidados. */
function responder(codigo, itens, ip) {
  const c = db.prepare('SELECT id FROM convites WHERE codigo = ?').get(codigo);
  if (!c) return { erro: 'convite_nao_encontrado' };
  const pessoas = db.prepare('SELECT id FROM convidados WHERE convite_id = ?').all(c.id).map(p => p.id);
  if (!Array.isArray(itens) || itens.length > 100 || !itens.every(i => i && typeof i === 'object')) return { erro: 'itens_invalidos' };
  const mapa = new Map(itens.map(i => [Number(i.id), i.status]));
  const valido = pessoas.length > 0 && mapa.size === pessoas.length &&
    pessoas.every(id => mapa.get(id) === 'vai' || mapa.get(id) === 'nao');
  if (!valido) return { erro: 'itens_invalidos' };

  const quando = agora();
  db.transaction(() => {
    const up = db.prepare('UPDATE convidados SET status = ?, atualizado_em = ? WHERE id = ? AND convite_id = ?');
    pessoas.forEach(id => up.run(mapa.get(id), quando, id, c.id));
    db.prepare('UPDATE convites SET respondido_em = ? WHERE id = ?').run(quando, c.id);
    db.prepare('INSERT INTO historico_respostas (convite_id, itens_json, ip) VALUES (?, ?, ?)')
      .run(c.id, JSON.stringify(pessoas.map(id => ({ id, status: mapa.get(id) }))), ip || null);
  })();
  return { ok: true, resposta: conviteCompleto(c.id).resposta };
}

/**
 * O convite conta como respondido quando todas as pessoas têm status.
 * Chamar depois de mudar o status, adicionar ou remover alguém pelo painel.
 */
function atualizarRespondido(conviteId) {
  const { total, pendentes } = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(status IS NULL), 0) pendentes
    FROM convidados WHERE convite_id = ?`).get(conviteId);
  db.prepare('UPDATE convites SET respondido_em = CASE WHEN ? > 0 AND ? = 0 THEN COALESCE(respondido_em, ?) ELSE NULL END WHERE id = ?')
    .run(total, pendentes, agora(), conviteId);
}

/** Remove nomes vazios e repetidos (comparando sem acento/maiúscula), mantendo a primeira grafia. */
function semRepetidos(nomes) {
  const vistos = new Set();
  return nomes.map(limparNome).filter(n => n && !vistos.has(norm(n)) && vistos.add(norm(n)));
}

function criarConvite({ rotulo, nomes, observacao }) {
  const limpos = semRepetidos(nomes || []);
  if (!limpos.length) throw new ErroEntrada('Informe pelo menos um nome.');
  return db.transaction(() => {
    const r = db.prepare('INSERT INTO convites (codigo, rotulo, observacao) VALUES (?, ?, ?)')
      .run(novoCodigo(), (rotulo || limpos[0]).trim(), observacao || null);
    const ins = db.prepare('INSERT INTO convidados (convite_id, nome, nome_norm) VALUES (?, ?, ?)');
    limpos.forEach(n => ins.run(r.lastInsertRowid, n, norm(n)));
    return r.lastInsertRowid;
  })();
}

// ---------- CSV ----------
// Formato: rotulo_convite,nome  (uma linha por pessoa; mesmo rótulo = mesmo convite).
// Aceita vírgula ou ponto e vírgula (Excel em português) e cabeçalho opcional.
// Devolve { linhas: [{ n, rotulo, nome }], ignoradas: [números das linhas sem as duas colunas] }.
function lerCsv(texto) {
  const todas = String(texto).replace(/^\uFEFF/, '').split(/\r?\n/);
  const linhas = todas.map((l, i) => ({ n: i + 1, l })).filter(x => x.l.trim());
  if (!linhas.length) return { linhas: [], ignoradas: [] };
  const primeira = linhas[0].l;
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const campos = linha => {
    const out = []; let atual = '', aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (aspas) {
        if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
        else if (ch === '"') aspas = false;
        else atual += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { out.push(atual); atual = ''; }
      else atual += ch;
    }
    out.push(atual);
    return out.map(s => s.trim());
  };
  const rows = linhas.map(x => Object.assign(campos(x.l), { n: x.n }));
  if (/convite|rotulo|rótulo/i.test(rows[0][0]) && /nome/i.test(rows[0][1] || '')) rows.shift();
  const ok = rows.filter(r => limparNome(r[0]) && limparNome(r[1]));
  return {
    linhas: ok.map(r => ({ n: r.n, rotulo: limparNome(r[0]), nome: limparNome(r[1]) })),
    ignoradas: rows.filter(r => !ok.includes(r)).map(r => r.n)
  };
}

/**
 * Importa o CSV sem duplicar:
 *  - rótulos iguais sem acento/maiúscula ("Família Ávila" = "familia avila") são o mesmo convite;
 *  - a mesma pessoa repetida no arquivo ou já cadastrada naquele convite é ignorada;
 *  - avisa quando um nome idêntico já existe em OUTRO convite (a busca daria "ambíguo").
 */
function importarCsv(texto) {
  const { linhas, ignoradas } = lerCsv(texto);
  const grupos = new Map(); // norm(rotulo) → { rotulo, nomes[] }
  linhas.forEach(({ rotulo, nome }) => {
    const k = norm(rotulo);
    if (!grupos.has(k)) grupos.set(k, { rotulo, nomes: [] });
    grupos.get(k).nomes.push(nome);
  });

  let convites = 0, pessoas = 0;
  const emOutroConvite = [];
  db.transaction(() => {
    const existentes = new Map(db.prepare('SELECT id, rotulo FROM convites').all().map(c => [norm(c.rotulo), c.id]));
    const outroConvite = db.prepare('SELECT c.rotulo FROM convidados p JOIN convites c ON c.id = p.convite_id WHERE p.nome_norm = ? AND c.id IS NOT ? LIMIT 1');
    const ins = db.prepare('INSERT INTO convidados (convite_id, nome, nome_norm) VALUES (?, ?, ?)');
    for (const [k, { rotulo, nomes }] of grupos) {
      let id = existentes.get(k);
      const jaTem = new Set(id ? db.prepare('SELECT nome_norm FROM convidados WHERE convite_id = ?').all(id).map(p => p.nome_norm) : []);
      const novos = semRepetidos(nomes).filter(n => !jaTem.has(norm(n)));
      novos.forEach(n => { const o = outroConvite.get(norm(n), id || null); if (o) emOutroConvite.push({ nome: n, convite: o.rotulo }); });
      if (!novos.length) continue;
      if (id) novos.forEach(n => ins.run(id, n, norm(n)));
      else { id = criarConvite({ rotulo, nomes: novos }); existentes.set(k, id); convites++; }
      pessoas += novos.length;
    }
  })();
  return {
    convitesCriados: convites,
    convidadosAdicionados: pessoas,
    repetidosIgnorados: linhas.length - pessoas,
    linhasIgnoradas: ignoradas,
    emOutroConvite
  };
}

// Data legível no Excel, no horário de Brasília: 03/05/2027 18:30
const dataPlanilha = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
// O Excel executa células que começam com = + - @ como fórmula; o apóstrofo impede isso
const semFormula = v => /^[=+\-@\t\r]/.test(v) ? "'" + v : v;

function exportarCsv() {
  const rows = db.prepare(`
    SELECT c.rotulo, p.nome, p.status, p.atualizado_em, c.observacao
    FROM convidados p JOIN convites c ON c.id = p.convite_id
    ORDER BY c.rotulo, p.id`).all();
  const q = v => '"' + semFormula(String(v == null ? '' : v)).replace(/"/g, '""') + '"';
  const status = s => s === 'vai' ? 'Vai' : s === 'nao' ? 'Não vai' : 'Pendente';
  return '\uFEFF' + ['convite;nome;status;respondido_em;observacao']
    .concat(rows.map(r => [r.rotulo, r.nome, status(r.status), dataPlanilha(r.atualizado_em), r.observacao].map(q).join(';')))
    .join('\r\n');
}

module.exports = { norm, limparNome, lerCsv, atualizarRespondido, buscarPorNome, responder, criarConvite, importarCsv, exportarCsv, conviteCompleto };
