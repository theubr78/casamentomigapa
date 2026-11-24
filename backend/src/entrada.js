// Validação das entradas da API. Um ErroEntrada vira resposta 400 com mensagem amigável (ver app.js).
class ErroEntrada extends Error {
  constructor(mensagem, erro = 'dados_invalidos', status = 400) {
    super(mensagem);
    this.erro = erro;
    this.status = status;
  }
}

const vazio = v => v == null || (typeof v === 'string' && !v.trim());
const temCampo = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/** Texto de uma linha: espaços repetidos viram um, e o tamanho é limitado. Vazio → null. */
function texto(v, rotulo, { max = 120, obrigatorio = false } = {}) {
  if (vazio(v)) {
    if (obrigatorio) throw new ErroEntrada(`Preencha ${rotulo}.`);
    return null;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ErroEntrada(`Valor inválido em ${rotulo}.`);
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (t.length > max) throw new ErroEntrada(`${rotulo[0].toUpperCase() + rotulo.slice(1)} pode ter até ${max} caracteres.`);
  return t;
}

/** Número inteiro (aceita "12" vindo de formulário). */
function inteiro(v, mensagem, { min, max }) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v) ? Number(v) : NaN);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroEntrada(mensagem);
  return n;
}

function booleano(v, rotulo) {
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  throw new ErroEntrada(`Valor inválido em ${rotulo}.`);
}

/**
 * Endereço web. Só http(s) — "javascript:" e "data:" são recusados (executariam código ao clicar).
 * relativa: aceita também um caminho dentro de assets/ (fotos publicadas junto com o site).
 * soHttps: recusa http:// (a foto seria bloqueada como conteúdo misto num site com HTTPS).
 */
function url(v, rotulo, { relativa = false, soHttps = false } = {}) {
  if (vazio(v)) return null;
  const t = texto(v, rotulo, { max: 1000 });
  if (relativa && /^assets\/[A-Za-z0-9_\-./]+$/.test(t) && !t.includes('..')) return t;
  let u;
  try { u = new URL(t); } catch (e) { u = null; }
  const ok = u && (u.protocol === 'https:' || (!soHttps && u.protocol === 'http:'));
  if (!ok) {
    throw new ErroEntrada(`${rotulo[0].toUpperCase() + rotulo.slice(1)} precisa ser um endereço que começa com https://` +
      (relativa ? ' ou um caminho como assets/presentes/foto.jpg' : '') + '.');
  }
  return u.href;
}

module.exports = { ErroEntrada, texto, inteiro, booleano, url, vazio, temCampo };
