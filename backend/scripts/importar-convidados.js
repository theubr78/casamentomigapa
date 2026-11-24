// Uso: npm run importar -- caminho/para/convidados.csv
// CSV: convite,nome  (uma pessoa por linha; mesmo "convite" = mesmo convite)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { importarCsv } = require('../src/convidados');

const arquivo = process.argv[2];
if (!arquivo) { console.error('Informe o arquivo: npm run importar -- convidados.csv'); process.exit(1); }
console.log(importarCsv(fs.readFileSync(arquivo, 'utf8')));
