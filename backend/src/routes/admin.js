// Rotas do painel dos noivos. Todas exigem: Authorization: Bearer <ADMIN_TOKEN>
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { norm, criarConvite, importarCsv, exportarCsv, atualizarRespondido } = require('../convidados');
const { ErroEntrada, texto, inteiro, booleano, url, vazio, temCampo } = require('../entrada');

const r = express.Router();

r.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));
// Contra adivinhação da senha: 10 senhas erradas por IP a cada 15 min (as certas não contam)
r.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true, requestWasSuccessful: (req, res) => res.statusCode !== 401,
  message: { erro: 'muitas_tentativas', mensagem: 'Muitas senhas erradas seguidas. Espere 15 minutos e tente de novo.' }
}));
// Compara o hash dos dois lados: mesmo tamanho sempre, em tempo constante (não revela nem o tamanho do token)
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
r.use((req, res, next) => {
  const esperado = process.env.ADMIN_TOKEN || '';
  if (esperado.length < 16) return res.status(503).json({ erro: 'admin_desativado', mensagem: 'Painel desativado: defina ADMIN_TOKEN (16+ caracteres) no .env do servidor.' });
  const recebido = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!crypto.timingSafeEqual(hash(recebido), hash(esperado))) return res.status(401).json({ erro: 'nao_autorizado' });
  next();
});

const agora = () => new Date().toISOString();
const id = req => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : -1);
const corpo = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
const duplicado = e => e && e.code === 'SQLITE_CONSTRAINT_UNIQUE';
const JA_NO_CONVITE = { erro: 'ja_existe', mensagem: 'Essa pessoa já está neste convite.' };
const NAO_ENCONTRADO = { erro: 'nao_encontrado', mensagem: 'Não encontrado. Recarregue a página.' };
const nomePessoa = v => texto(v, 'o nome', { obrigatorio: true });

// ---------- Resumo ----------
r.get('/resumo', (req, res) => {
  const c = db.prepare(`SELECT
      (SELECT COUNT(*) FROM convites) AS convites,
      (SELECT COUNT(*) FROM convites WHERE respondido_em IS NOT NULL) AS convitesRespondidos,
      (SELECT COUNT(*) FROM convidados) AS convidados,
      (SELECT COUNT(*) FROM convidados WHERE status = 'vai') AS vao,
      (SELECT COUNT(*) FROM convidados WHERE status = 'nao') AS naoVao,
      (SELECT COUNT(*) FROM convidados WHERE status IS NULL) AS pendentes,
      (SELECT COUNT(*) FROM escolhas WHERE modo = 'comprar') AS presentesComprar,
      (SELECT COUNT(*) FROM escolhas WHERE modo = 'pix') AS presentesPix,
      (SELECT COALESCE(SUM(COALESCE(e.presente_valor, p.valor)), 0) FROM escolhas e LEFT JOIN presentes p ON p.id = e.presente_id WHERE e.modo = 'pix') AS valorPixPrometido,
      (SELECT COUNT(*) FROM escolhas WHERE conferido = 0) AS escolhasAConferir`).get();
  res.json(c);
});

// ---------- Convites e convidados ----------
r.get('/convites', (req, res) => {
  const convites = db.prepare('SELECT * FROM convites ORDER BY rotulo COLLATE NOCASE').all();
  const pessoas = db.prepare('SELECT id, convite_id, nome, status, atualizado_em FROM convidados ORDER BY id').all();
  const por = new Map(convites.map(c => [c.id, Object.assign(c, { convidados: [] })]));
  pessoas.forEach(p => { const c = por.get(p.convite_id); if (c) c.convidados.push(p); });
  res.json(convites);
});

r.post('/convites', (req, res) => {
  const b = corpo(req);
  if (!Array.isArray(b.nomes) || b.nomes.length > 50) throw new ErroEntrada('Informe os convidados, um por linha (até 50 por convite).');
  const nomes = b.nomes.map(n => texto(n, 'o nome')).filter(Boolean);
  const novo = criarConvite({
    rotulo: texto(b.rotulo, 'o nome do convite'),
    nomes,
    observacao: texto(b.observacao, 'a observação', { max: 500 })
  });
  res.status(201).json(db.prepare('SELECT * FROM convites WHERE id = ?').get(novo));
});

r.patch('/convites/:id', (req, res) => {
  const b = corpo(req);
  const c = db.prepare('SELECT * FROM convites WHERE id = ?').get(id(req));
  if (!c) return res.status(404).json(NAO_ENCONTRADO);
  const rotulo = temCampo(b, 'rotulo') ? texto(b.rotulo, 'o nome do convite', { obrigatorio: true }) : c.rotulo;
  const observacao = temCampo(b, 'observacao') ? texto(b.observacao, 'a observação', { max: 500 }) : c.observacao;
  db.prepare('UPDATE convites SET rotulo = ?, observacao = ? WHERE id = ?').run(rotulo, observacao, c.id);
  res.json(db.prepare('SELECT * FROM convites WHERE id = ?').get(c.id));
});

r.delete('/convites/:id', (req, res) => {
  const out = db.prepare('DELETE FROM convites WHERE id = ?').run(id(req));
  res.status(out.changes ? 204 : 404).end();
});

r.post('/convites/:id/convidados', (req, res) => {
  const nome = nomePessoa(corpo(req).nome);
  const conviteId = id(req);
  if (!db.prepare('SELECT 1 FROM convites WHERE id = ?').get(conviteId)) return res.status(404).json(NAO_ENCONTRADO);
  try {
    const novo = db.transaction(() => {
      const out = db.prepare('INSERT INTO convidados (convite_id, nome, nome_norm) VALUES (?, ?, ?)').run(conviteId, nome, norm(nome));
      atualizarRespondido(conviteId); // alguém novo e sem resposta: o convite volta a "sem resposta"
      return out.lastInsertRowid;
    })();
    res.status(201).json(db.prepare('SELECT * FROM convidados WHERE id = ?').get(novo));
  } catch (e) { if (duplicado(e)) return res.status(409).json(JA_NO_CONVITE); throw e; }
});

// Corrigir nome ou marcar status manualmente (ex.: confirmou por WhatsApp)
r.patch('/convidados/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM convidados WHERE id = ?').get(id(req));
  if (!p) return res.status(404).json(NAO_ENCONTRADO);
  const b = corpo(req);
  const nome = temCampo(b, 'nome') ? nomePessoa(b.nome) : p.nome;
  let status = p.status;
  if (temCampo(b, 'status')) {
    if (![null, 'vai', 'nao'].includes(b.status)) return res.status(400).json({ erro: 'status_invalido', mensagem: 'Status deve ser Vai, Não vai ou Pendente.' });
    status = b.status;
  }
  try {
    db.transaction(() => {
      db.prepare('UPDATE convidados SET nome = ?, nome_norm = ?, status = ?, atualizado_em = ? WHERE id = ?')
        .run(nome, norm(nome), status, status !== p.status ? agora() : p.atualizado_em, p.id);
      atualizarRespondido(p.convite_id);
    })();
  } catch (e) { if (duplicado(e)) return res.status(409).json(JA_NO_CONVITE); throw e; }
  res.json(db.prepare('SELECT * FROM convidados WHERE id = ?').get(p.id));
});

r.delete('/convidados/:id', (req, res) => {
  const p = db.prepare('SELECT convite_id FROM convidados WHERE id = ?').get(id(req));
  if (!p) return res.status(404).end();
  db.transaction(() => {
    db.prepare('DELETE FROM convidados WHERE id = ?').run(id(req));
    atualizarRespondido(p.convite_id); // se só faltava essa pessoa, o convite passa a respondido
  })();
  res.status(204).end();
});

r.get('/convites/:id/historico', (req, res) => {
  res.json(db.prepare('SELECT * FROM historico_respostas WHERE convite_id = ? ORDER BY id DESC').all(id(req))
    .map(h => Object.assign(h, { itens: JSON.parse(h.itens_json) })));
});

// CSV: corpo text/csv com linhas "convite,nome"
r.post('/importar', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), (req, res) => {
  if (typeof req.body !== 'string' || !req.body.trim()) return res.status(400).json({ erro: 'csv_vazio', mensagem: 'O arquivo está vazio ou não é um CSV.' });
  res.json(importarCsv(req.body));
});

r.get('/exportar.csv', (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="convidados-' + new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + '.csv"');
  res.send(exportarCsv());
});

// ---------- Presentes ----------
const MSG_VALOR = 'Valor inválido. Use reais, ex.: 250,00 (de R$ 0,01 a R$ 100.000,00).';
const MSG_QTD = 'Quantidade inválida. Use um número inteiro de 0 (só Pix) a 1000.';

/**
 * Campos de um presente vindos do painel. Em PATCH (parcial) só os campos enviados mudam.
 * Campo enviado vazio: nome/valor/quantidade dão erro; descrição, foto e link ficam em branco.
 */
function camposPresente(b, parcial) {
  const f = {};
  const usar = k => !parcial || temCampo(b, k);
  if (usar('nome')) f.nome = texto(b.nome, 'o nome do presente', { obrigatorio: true });
  if (temCampo(b, 'descricao')) f.descricao = texto(b.descricao, 'a descrição', { max: 500 });
  if (usar('valor')) f.valor = inteiro(b.valor, MSG_VALOR, { min: 1, max: 10000000 }); // centavos
  if (temCampo(b, 'imagem')) f.imagem = url(b.imagem, 'a foto', { relativa: true, soHttps: true });
  if (temCampo(b, 'linkLoja')) f.link_loja = url(b.linkLoja, 'o link da loja');
  if (temCampo(b, 'quantidade')) {
    if (vazio(b.quantidade)) throw new ErroEntrada(MSG_QTD);
    f.quantidade = inteiro(b.quantidade, MSG_QTD, { min: 0, max: 1000 });
  }
  if (temCampo(b, 'ordem')) f.ordem = vazio(b.ordem) ? 0 : inteiro(b.ordem, 'Ordem inválida. Use um número inteiro.', { min: -100000, max: 100000 });
  if (temCampo(b, 'ativo')) f.ativo = booleano(b.ativo, 'ativo') ? 1 : 0;
  return f;
}

r.get('/presentes', (req, res) => {
  res.json(db.prepare(`SELECT p.*, ${db.sqlDisponiveis} AS disponiveis,
      (SELECT COUNT(*) FROM escolhas e WHERE e.presente_id = p.id AND e.modo = 'comprar') AS comprar,
      (SELECT COUNT(*) FROM escolhas e WHERE e.presente_id = p.id AND e.modo = 'pix') AS pix
    FROM presentes p ORDER BY ordem, id`).all());
});

r.post('/presentes', (req, res) => {
  const f = Object.assign({ descricao: null, imagem: null, link_loja: null, quantidade: 1, ordem: 0, ativo: 1 }, camposPresente(corpo(req), false));
  const out = db.prepare('INSERT INTO presentes (nome, descricao, valor, imagem, link_loja, quantidade, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(f.nome, f.descricao, f.valor, f.imagem, f.link_loja, f.quantidade, f.ordem, f.ativo);
  res.status(201).json(db.prepare('SELECT * FROM presentes WHERE id = ?').get(out.lastInsertRowid));
});

r.patch('/presentes/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM presentes WHERE id = ?').get(id(req));
  if (!atual) return res.status(404).json(NAO_ENCONTRADO);
  const m = Object.assign({}, atual, camposPresente(corpo(req), true));
  db.prepare('UPDATE presentes SET nome=?, descricao=?, valor=?, imagem=?, link_loja=?, quantidade=?, ordem=?, ativo=? WHERE id=?')
    .run(m.nome, m.descricao, m.valor, m.imagem, m.link_loja, m.quantidade, m.ordem, m.ativo, m.id);
  res.json(db.prepare('SELECT * FROM presentes WHERE id = ?').get(m.id));
});

r.delete('/presentes/:id', (req, res) => {
  const out = db.prepare('DELETE FROM presentes WHERE id = ?').run(id(req));
  res.status(out.changes ? 204 : 404).end();
});

// ---------- Escolhas dos convidados (comprar / Pix) ----------
r.get('/escolhas', (req, res) => {
  // Nome/valor de quando o convidado escolheu (continuam aí mesmo se o presente for excluído ou mudar de preço)
  res.json(db.prepare(`SELECT e.*, COALESCE(e.presente_nome, p.nome) AS presente, COALESCE(e.presente_valor, p.valor) AS valor
    FROM escolhas e LEFT JOIN presentes p ON p.id = e.presente_id ORDER BY e.id DESC`).all());
});

// conferido = Pix caiu no extrato / presente chegou
r.patch('/escolhas/:id', (req, res) => {
  const conferido = booleano(corpo(req).conferido, 'conferido');
  const out = db.prepare('UPDATE escolhas SET conferido = ? WHERE id = ?').run(conferido ? 1 : 0, id(req));
  res.status(out.changes ? 200 : 404).json({ ok: !!out.changes });
});

// Excluir libera a reserva (ex.: o convidado desistiu de comprar)
r.delete('/escolhas/:id', (req, res) => {
  const out = db.prepare('DELETE FROM escolhas WHERE id = ?').run(id(req));
  res.status(out.changes ? 204 : 404).end();
});

module.exports = r;
