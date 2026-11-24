// Ponto de entrada: carrega e valida o .env e sobe o app na porta configurada.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const config = require('./config');

const { erros, avisos, info } = config.validar();
info.forEach(t => console.log(t));
avisos.forEach(t => console.warn('Aviso: ' + t));
if (erros.length) {
  erros.forEach(t => console.error('Erro no .env: ' + t));
  console.error('O servidor não foi iniciado. Corrija o arquivo backend/.env e tente de novo.');
  process.exit(1);
}

const app = require('./app');
const PORTA = Number(process.env.PORT || 3000);

app.listen(PORTA, () => {
  console.log(`Site em http://localhost:${PORTA}  ·  painel em http://localhost:${PORTA}/admin/`);
});
