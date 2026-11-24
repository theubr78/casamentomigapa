/** Utilitários: erros, textos, acesso às planilhas, trava e alertas. */

/** Erro esperado, com código e mensagem que podem ir para o site. */
class ErroApi extends Error {
  constructor(codigo, mensagem) {
    super(mensagem || codigo);
    this.codigo = codigo;
  }
}

/** A planilha não tem a estrutura esperada (coluna renomeada, aba apagada…). Nada é gravado. */
class ErroEstrutura extends Error {}

// Faixa dos acentos combinantes (U+0300–U+036F), montada por código para não depender de caracteres invisíveis
var ACENTOS_ = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Sem acento, minúsculo e com espaços simples: a mesma regra do site. */
function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(ACENTOS_, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Valor de célula como texto limpo. */
function texto_(v) {
  if (v == null || ehData_(v)) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function ehData_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function dataIso_(v) {
  return ehData_(v) && !isNaN(v.getTime()) ? v.toISOString() : '';
}

/**
 * Texto vindo do site, pronto para gravar: sem caracteres de controle, tamanho limitado e
 * NUNCA interpretado como fórmula. Um recado como =IMPORTXML("https://…"&A2:A300) poderia
 * enviar a lista de convidados para fora; o apóstrofo na frente faz a célula guardar só o texto.
 */
function textoSeguro_(v, max) {
  var t = String(v == null ? '' : v).split('').filter(function (ch) {
    var c = ch.charCodeAt(0);
    return c >= 32 && c !== 127;
  }).join('').replace(/\s+/g, ' ').trim();
  if (max) t = t.slice(0, max).trim();
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/** Só endereços web de verdade (nunca "javascript:"). */
function linkSeguro_(u) {
  var t = texto_(u);
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : '';
}

/** Letra da coluna: 1 → A, 27 → AA. */
function letra_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Comparação em tempo constante (não revela quantos caracteres batem). */
function iguais_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- propriedades e planilhas ----------

function propriedade_(nome) {
  return PropertiesService.getScriptProperties().getProperty(nome) || '';
}

function planilhaConvidados_() {
  var id = propriedade_(PROPRIEDADES.ID_CONVIDADOS);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function planilhaPresentes_() {
  var id = propriedade_(PROPRIEDADES.ID_PRESENTES);
  if (!id) throw new ErroEstrutura('Falta informar a planilha de presentes (menu Casamento → Configurar).');
  return SpreadsheetApp.openById(id);
}

function aba_(planilha, nome) {
  var aba = planilha.getSheetByName(nome);
  if (!aba) throw new ErroEstrutura('A aba "' + nome + '" não existe na planilha "' + planilha.getName() + '". Use o menu Casamento → Preparar planilhas.');
  return aba;
}

// ---------- trava ----------

/**
 * Executa fn com a trava do script: uma gravação por vez, nas duas planilhas.
 * Se outra gravação demorar mais que o limite, desiste com uma mensagem amigável (nada é gravado).
 */
function comTrava_(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(LIMITES.ESPERA_TRAVA_MS)) {
    throw new ErroApi('ocupado', 'Muita gente usando o site agora. Tente de novo em instantes.');
  }
  try {
    var resultado = fn();
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    trava.releaseLock();
  }
}

// ---------- alertas ----------

/** E-mail para quem instalou (ou EMAIL_ALERTA), no máximo um por hora por assunto. */
function alertar_(assunto, detalhe) {
  try {
    var cache = CacheService.getScriptCache();
    var chave = 'alerta:' + String(assunto).slice(0, 200);
    if (cache.get(chave)) return;
    cache.put(chave, '1', 3600);
    var para = propriedade_(PROPRIEDADES.EMAIL_ALERTA) || Session.getEffectiveUser().getEmail();
    if (para) {
      MailApp.sendEmail(para, '[Site do casamento] ' + assunto,
        String(detalhe).slice(0, 5000) + '\n\n(Este aviso é enviado no máximo uma vez por hora.)');
    }
  } catch (e) {
    console.error('Falha ao enviar alerta: ' + e);
  }
}
