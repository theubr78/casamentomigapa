/* Configuração do frontend.
   apiBase: deixe '' quando o backend servir o site (mesma origem).
   Se hospedar o frontend separado (Netlify, Vercel…), coloque a URL
   do backend, ex.: 'https://api.millenaeleonardo.com.br'.
   WhatsApp, Spotify, YouTube e prazo vêm de GET /api/config (arquivo .env do backend). */
window.SITE_CONFIG = {
  apiBase: '',
  // 15h de 03/07/2027 em Brasília (UTC-3)
  dataCasamento: '2027-07-03T15:00:00-03:00',
  fimDoDia: '2027-07-04T00:00:00-03:00'
};
