// Popula o banco com os convites e presentes de exemplo do design (só para desenvolvimento).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { importarCsv, responder, buscarPorNome } = require('../src/convidados');

console.log('Convidados:', importarCsv(fs.readFileSync(path.join(__dirname, '..', 'data', 'convidados-exemplo.csv'), 'utf8')));

// Convite C004 já respondido, como na prévia do design
const c4 = buscarPorNome('Carla Mendes');
if (c4.tipo === 'ok' && !c4.convite.resposta) {
  const [carla, rafael] = c4.convite.convidados;
  responder(c4.convite.codigo, [{ id: carla.id, status: 'vai' }, { id: rafael.id, status: 'nao' }], 'exemplo');
}

if (!db.prepare('SELECT COUNT(*) n FROM presentes').get().n) {
  const ins = db.prepare('INSERT INTO presentes (nome, descricao, valor, quantidade, link_loja, ordem) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['Jogo de panelas', 'Para os primeiros almoços de domingo', 45000, 1, 'https://www.exemplo.com.br/jogo-de-panelas', 1],
    ['Cafeteira', 'O café de todas as manhãs', 32000, 1, 'https://www.exemplo.com.br/cafeteira', 2],
    ['Jogo de toalhas', 'Banho e rosto, 4 peças', 18000, 2, null, 3],
    ['Jantar romântico na lua de mel', 'Uma noite especial para nós dois', 25000, 0, null, 4] // 0 = só Pix
  ].forEach(p => ins.run(...p));
  console.log('Presentes de exemplo criados: 4');
}
