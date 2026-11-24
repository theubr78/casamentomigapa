// Gera o "Pix copia e cola" (BR Code / EMV estático) com valor, e o QR Code.
// Especificação: Manual de Padrões para Iniciação do Pix (Banco Central).
const QRCode = require('qrcode');

const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Texto seguro para o BR Code: sem acento e só letras, números e espaço (alguns bancos recusam
// qualquer outro caractere, e o CRC é calculado byte a byte, o que exige ASCII).
const textoPix = (s, max, { maiusculas = true } = {}) => {
  let t = semAcento(s);
  if (maiusculas) t = t.toUpperCase();
  return t.replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
};
// Campo EMV: ID (2) + tamanho (2) + valor. O tamanho tem 2 dígitos, então o valor vai de 1 a 99 caracteres.
const campo = (id, valor) => {
  if (!valor.length || valor.length > 99) throw new Error(`Campo Pix ${id} com ${valor.length} caracteres (o permitido é de 1 a 99).`);
  return id + String(valor.length).padStart(2, '0') + valor;
};

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Dígitos verificadores (para não confundir CPF com telefone sem +55)
function cpfValido(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function cnpjValido(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const dv = n => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/**
 * Normaliza a chave Pix para o formato do DICT (Manual de Padrões para Iniciação do Pix):
 *  CPF/CNPJ só dígitos · telefone +55DDDNÚMERO · e-mail e chave aleatória como estão.
 * Lança erro com uma explicação se o formato não for reconhecido.
 */
function normalizarChave(bruta) {
  const c = String(bruta || '').trim();
  if (!c) throw new Error('PIX_CHAVE não configurada');
  if (c.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) || c.length > 77) throw new Error(`PIX_CHAVE "${c}" não parece um e-mail válido.`);
    return { tipo: 'e-mail', chave: c };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return { tipo: 'chave aleatória', chave: c };
  if (c.startsWith('+')) {
    const t = c.replace(/[\s().-]/g, '');
    if (!/^\+55\d{10,11}$/.test(t)) throw new Error(`PIX_CHAVE "${c}": telefone deve ter +55, DDD e número, ex.: +5573999999999.`);
    return { tipo: 'telefone', chave: t };
  }
  const d = c.replace(/[.\-/\s]/g, '');
  if (/^\d{11}$/.test(d)) {
    if (!cpfValido(d)) throw new Error(`PIX_CHAVE "${c}" não é um CPF válido. Se for telefone, escreva com +55, ex.: +55${d}.`);
    return { tipo: 'CPF', chave: d };
  }
  if (/^\d{14}$/.test(d)) {
    if (!cnpjValido(d)) throw new Error(`PIX_CHAVE "${c}" não é um CNPJ válido.`);
    return { tipo: 'CNPJ', chave: d };
  }
  throw new Error(`PIX_CHAVE "${c}" em formato não reconhecido. Use CPF, CNPJ, e-mail, telefone com +55 ou a chave aleatória.`);
}

/**
 * @param {object} o
 * @param {string} o.chave   chave Pix (e-mail, CPF, telefone +55…, aleatória)
 * @param {string} o.nome    nome do recebedor (até 25 caracteres)
 * @param {string} o.cidade  cidade do recebedor (até 15 caracteres)
 * @param {number} [o.valorCentavos]
 * @param {string} [o.txid]  identificador (até 25, letras/números)
 * @param {string} [o.descricao]
 */
function payloadPix({ chave, nome, cidade, valorCentavos, txid, descricao }) {
  const desc = descricao ? textoPix(descricao, 40, { maiusculas: false }) : '';
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', normalizarChave(chave).chave) + (desc ? campo('02', desc) : '');
  const id = (semAcento(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***';
  if (valorCentavos != null && !(Number.isInteger(valorCentavos) && valorCentavos > 0)) throw new Error('Valor do Pix inválido: ' + valorCentavos);
  const nomeRec = textoPix(nome, 25), cidadeRec = textoPix(cidade, 15);
  if (!nomeRec || !cidadeRec) throw new Error('PIX_NOME e PIX_CIDADE precisam ter letras ou números.');
  let p = campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (valorCentavos ? campo('54', (valorCentavos / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', nomeRec) +
    campo('60', cidadeRec) +
    campo('62', campo('05', id)) +
    '6304';
  return p + crc16(p);
}

async function qrDataUrl(texto) {
  return QRCode.toDataURL(texto, { margin: 1, width: 416, color: { dark: '#3A2A2A', light: '#FFFFFF' } });
}

module.exports = { payloadPix, qrDataUrl, crc16, normalizarChave, textoPix };
