// Cabeçalhos de segurança de todas as respostas (sem dependência extra).
//
// CSP: o site só roda scripts dele mesmo (não há <script> inline). Exceções necessárias:
//  - estilos inline: o HTML e o JS usam alguns atributos style="…"
//  - iframes: vídeo (YouTube sem cookies), playlist (Spotify) e mapa (Google Maps)
//  - imagens https: (foto de presente pode ser um link externo) e data: (QR Code do Pix)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", // fontes servidas pelo próprio site (frontend/fonts)
  "img-src 'self' data: https:",
  'frame-src https://www.youtube-nocookie.com https://open.spotify.com https://maps.google.com https://www.google.com',
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'" // ninguém pode embutir o site (nem o painel) num iframe
].join('; ');

module.exports = function cabecalhosSeguranca(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', // navegadores antigos que não entendem frame-ancestors
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  // HSTS só em produção (com HTTPS). 180 dias, sem subdomínios: seguro para começar.
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
};
module.exports.CSP = CSP;
