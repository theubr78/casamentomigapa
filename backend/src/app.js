// Monta o app Express (sem abrir porta): API em /api e o site (pasta frontend/) como arquivos estáticos.
// Separado do server.js para os testes usarem o app direto (supertest).
const path = require('path');
const express = require('express');
const config = require('./config');
const { ErroEntrada } = require('./entrada');

const app = express();

// Atrás de proxy (Render, Railway, Nginx…) o IP real vem no X-Forwarded-For: TRUST_PROXY=1
const proxy = config.trustProxy(process.env.TRUST_PROXY);
if (proxy !== false) app.set('trust proxy', proxy);
else {
  // Sem TRUST_PROXY mas chegando X-Forwarded-For: quase certo que há um proxy e todos os convidados
  // estão contando como o mesmo IP. Avisa uma vez no log.
  let avisou = false;
  app.use((req, res, next) => {
    if (!avisou && req.headers['x-forwarded-for']) {
      avisou = true;
      console.warn('Aviso: chegou X-Forwarded-For mas TRUST_PROXY não está definido. Se o site estiver atrás de proxy, defina TRUST_PROXY=1.');
    }
    next();
  });
}
app.disable('x-powered-by');
app.use(require('./seguranca'));
app.use(express.json({ limit: '100kb' }));

// CORS só se o frontend estiver em outro domínio (CORS_ORIGIN=https://seusite.com.br)
app.use('/api', (req, res, next) => {
  const origem = process.env.CORS_ORIGIN;
  if (origem) {
    res.set('Access-Control-Allow-Origin', origem);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/publico'));
app.use('/api', (req, res) => res.status(404).json({ erro: 'rota_nao_encontrada' }));

// Site estático
const pastaSite = path.resolve(process.env.PASTA_FRONTEND || path.join(__dirname, '..', '..', 'frontend'));
app.use(express.static(pastaSite, {
  extensions: ['html'],
  setHeaders(res, arquivo) {
    // HTML/CSS/JS: o navegador sempre confere se mudou (resposta 304 rápida pelo ETag) — uma correção
    // publicada chega na hora, sem misturar HTML novo com JS velho.
    if (/\.(html|css|js)$/i.test(arquivo)) res.set('Cache-Control', 'no-cache');
    // Fotos e fontes: 7 dias em produção (se trocar uma foto, use outro nome de arquivo)
    else if (process.env.NODE_ENV === 'production') res.set('Cache-Control', 'public, max-age=604800');
  }
}));

// Erros: entrada inválida → 400/413 com mensagem; o resto → 500 (detalhe só no log)
app.use((err, req, res, next) => {
  if (err instanceof ErroEntrada) return res.status(err.status).json({ erro: err.erro, mensagem: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'json_invalido', mensagem: 'Não conseguimos ler os dados enviados. Recarregue a página e tente de novo.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'muito_grande', mensagem: 'O conteúdo enviado é grande demais.' });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ erro: 'pedido_invalido', mensagem: 'Pedido inválido.' });
  console.error(err);
  res.status(500).json({ erro: 'erro_interno', mensagem: 'Algo deu errado. Tente de novo.' });
});

module.exports = app;
