// Rotas públicas usadas pelo site.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { buscarPorNome, responder } = require('../convidados');
const { payloadPix, qrDataUrl } = require('../pix');
const { prazoRsvp, dadosPix } = require('../config');

const r = express.Router();
const limite = (max, minutos) => rateLimit({
  windowMs: minutos * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'muitas_tentativas', mensagem: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

const prazo = prazoRsvp; // validado ao subir o servidor (src/config.js)
const encerrado = () => Date.now() > prazo().getTime();
const prazoTexto = () => prazo().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });

// Conteúdo configurável pelo .env
r.get('/config', (req, res) => {
  res.json({
    whatsapp: process.env.WHATSAPP_NOIVOS || '',
    spotifyUrl: process.env.SPOTIFY_URL || '',
    youtubeId: process.env.YOUTUBE_ID || '',
    prazo: prazo().toISOString(),
    prazoTexto: prazoTexto(),
    encerrado: encerrado()
  });
});

// ---------- Confirmação de presença ----------
// Devolve SOMENTE o convite encontrado; a lista de convidados nunca vai para o navegador.
r.get('/convites/busca', limite(40, 10), (req, res) => {
  if (encerrado()) return res.status(403).json({ erro: 'prazo_encerrado' });
  const nome = String(req.query.nome || '').slice(0, 120);
  res.json(buscarPorNome(nome));
});

r.post('/convites/:codigo/resposta', limite(20, 10), (req, res) => {
  if (encerrado()) return res.status(403).json({ erro: 'prazo_encerrado' });
  const out = responder(String(req.params.codigo), req.body && req.body.itens, req.ip);
  if (out.erro === 'convite_nao_encontrado') return res.status(404).json(out);
  if (out.erro) return res.status(400).json(Object.assign(out, { mensagem: 'Marque uma opção para cada nome.' }));
  res.json(out.resposta);
});

// ---------- Lista de presentes ----------
const presentePublico = p => ({
  id: p.id, nome: p.nome, descricao: p.descricao, valor: p.valor, imagem: p.imagem,
  quantidade: p.quantidade, disponiveis: Math.max(0, p.disponiveis)
});

r.get('/presentes', (req, res) => {
  const lista = db.prepare(`SELECT p.*, ${db.sqlDisponiveis} AS disponiveis FROM presentes p WHERE ativo = 1 ORDER BY ordem, id`).all();
  res.json(lista.map(presentePublico));
});

r.get('/presentes/:id/pix', async (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM presentes WHERE id = ? AND ativo = 1').get(Number(req.params.id));
    if (!p) return res.status(404).json({ erro: 'presente_nao_encontrado' });
    const payload = payloadPix(Object.assign(dadosPix(), { valorCentavos: p.valor, txid: 'PRESENTE' + p.id }));
    res.json({
      nome: p.nome, valor: p.valor, payload, qr: await qrDataUrl(payload),
      recebedor: [process.env.PIX_RECEBEDOR_EXIBICAO || process.env.PIX_NOME, process.env.PIX_BANCO].filter(Boolean).join(' · ')
    });
  } catch (e) { next(e); }
});

// Convidado registra a escolha: { modo: 'comprar' | 'pix', nome, contato?, mensagem? }
r.post('/presentes/:id/escolhas', limite(15, 10), (req, res) => {
  const b = req.body || {};
  const modo = b.modo === 'comprar' ? 'comprar' : b.modo === 'pix' ? 'pix' : null;
  const nome = String(b.nome || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const contato = String(b.contato || '').trim().slice(0, 120);
  const mensagem = String(b.mensagem || '').trim().slice(0, 500);
  if (!modo) return res.status(400).json({ erro: 'modo_invalido' });
  if (nome.length < 2) return res.status(400).json({ erro: 'nome_obrigatorio', mensagem: 'Digite seu nome.' });

  // Reserva dentro de transação para dois convidados não pegarem a última unidade ao mesmo tempo.
  // IMMEDIATE trava a escrita já na leitura: seguro mesmo com outro processo usando o banco (ex.: um script).
  const out = db.transaction(() => {
    const p = db.prepare(`SELECT p.*, ${db.sqlDisponiveis} AS disponiveis FROM presentes p WHERE p.id = ? AND p.ativo = 1`).get(Number(req.params.id));
    if (!p) return { status: 404, corpo: { erro: 'presente_nao_encontrado' } };
    if (modo === 'comprar' && p.disponiveis <= 0) return { status: 409, corpo: { erro: 'esgotado', mensagem: 'Alguém já escolheu este presente para comprar.' } };
    db.prepare('INSERT INTO escolhas (presente_id, presente_nome, presente_valor, modo, nome, contato, mensagem) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.nome, p.valor, modo, nome, contato || null, mensagem || null);
    return {
      status: 201,
      corpo: modo === 'comprar'
        ? { ok: true, linkLoja: p.link_loja || null, entrega: process.env.ENDERECO_ENTREGA || '', disponiveis: p.disponiveis - 1 }
        : { ok: true }
    };
  }).immediate();
  res.status(out.status).json(out.corpo);
});

module.exports = r;
