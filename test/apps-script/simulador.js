// Simulador mínimo do Google Apps Script para testar os arquivos .gs no Node.
// Planilhas em memória; formatação/validação/proteção viram "no-op" que aceita qualquer chamada.
// Regras do Sheets que importam para os testes são imitadas:
//  - texto que começa com "=" vira FÓRMULA; com apóstrofo na frente vira só texto;
//  - getValues de célula com fórmula devolve '' (não calculamos fórmulas).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** Objeto que aceita qualquer método e devolve a si mesmo (para formatação, filtros etc.). */
function encadeavel(base = {}) {
  const p = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return undefined;
      return () => p;
    }
  });
  return p;
}

/** Construtor (newDataValidation, newConditionalFormatRule…) que registra as chamadas. */
function construtor(tipo) {
  const reg = { tipo, chamadas: [] };
  const p = new Proxy({}, {
    get(t, k) {
      if (k === 'build') return () => reg;
      if (typeof k === 'symbol') return undefined;
      return (...args) => { reg.chamadas.push([k, ...args]); return p; };
    }
  });
  return p;
}

class Aba {
  constructor(planilha, nome, grade = []) {
    this.planilha = planilha;
    this.nome = nome;
    this.celulas = [];
    this.validacoes = [];
    this.regrasCor = [];
    grade.forEach((linha, i) => linha.forEach((v, j) => { if (v !== undefined) this.definir(i + 1, j + 1, v); }));
    return encadeavel(this); // formatação (setFrozenRows, setColumnWidth…) é aceita e ignorada
  }
  celula(r, c) {
    if (!this.celulas[r - 1]) this.celulas[r - 1] = [];
    if (!this.celulas[r - 1][c - 1]) this.celulas[r - 1][c - 1] = { v: '' };
    return this.celulas[r - 1][c - 1];
  }
  ver(r, c) {
    const l = this.celulas[r - 1];
    return (l && l[c - 1]) || { v: '' };
  }
  definir(r, c, v) {
    const x = this.celula(r, c);
    x.f = undefined; x.link = undefined;
    if (v && typeof v === 'object' && !(v instanceof Date) && 'link' in v) { x.v = v.texto; x.link = v.link; return; }
    if (typeof v === 'string' && v.charAt(0) === "'") { x.v = v.slice(1); return; }
    if (typeof v === 'string' && v.charAt(0) === '=') { x.v = ''; x.f = v; return; }
    x.v = v;
  }
  temConteudo(x) { return x && ((x.v !== '' && x.v !== null && x.v !== undefined) || x.f); }
  getName() { return this.nome; }
  getParent() { return this.planilha; }
  getLastRow() {
    for (let r = this.celulas.length; r > 0; r--) if ((this.celulas[r - 1] || []).some(x => this.temConteudo(x))) return r;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.celulas.forEach(l => (l || []).forEach((x, j) => { if (this.temConteudo(x)) m = Math.max(m, j + 1); }));
    return m;
  }
  getMaxRows() { return Math.max(200, this.celulas.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) { return intervalo(this, r, c, nr, nc); }
  deleteRows(r, n) { this.celulas.splice(r - 1, n); }
  deleteRow(r) { this.deleteRows(r, 1); }
  getFilter() { return null; }
  getConditionalFormatRules() { return []; }
  setConditionalFormatRules(regras) { this.regrasCor = regras; }
  getProtections() { return []; }
  clear() { this.celulas = []; return this; }
  /** Para os testes: valores visíveis de uma linha. */
  linha(r) { const l = this.celulas[r - 1] || []; return l.map(x => (x ? x.v : '')); }
}

function intervalo(aba, r, c, nr, nc) {
  const cada = fn => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r + i, c + j, i, j); };
  const grade = fn => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(aba.ver(r + i, c + j))));
  const obj = {
    getValues: () => grade(x => (x.v === undefined ? '' : x.v)),
    getFormulas: () => grade(x => x.f || ''),
    getRichTextValues: () => grade(x => ({ getLinkUrl: () => x.link || null, getText: () => String(x.v) })),
    setValues(vals) { cada((rr, cc, i, j) => aba.definir(rr, cc, vals[i][j])); return p; },
    getValue: () => aba.ver(r, c).v,
    setValue(v) { cada((rr, cc) => aba.definir(rr, cc, v)); return p; },
    setFormula(f) { cada((rr, cc) => { const x = aba.celula(rr, cc); x.v = ''; x.f = f; }); return p; },
    clearContent() { cada((rr, cc) => { const x = aba.celula(rr, cc); x.v = ''; x.f = undefined; }); return p; },
    setDataValidation(v) { aba.validacoes.push({ r, c, nr, nc, v }); return p; },
    getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc,
    protect: () => encadeavel({})
  };
  const p = encadeavel(obj);
  return p;
}

class Planilha {
  constructor(id, nome, abas = {}) {
    this.id = id; this.nome = nome; this.abas = [];
    Object.keys(abas).forEach(n => this.abas.push(new Aba(this, n, abas[n])));
  }
  getId() { return this.id; }
  getName() { return this.nome; }
  getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }
  insertSheet(n) { const a = new Aba(this, n); this.abas.push(a); return a; }
  getSheets() { return this.abas.slice(); }
  setSpreadsheetTimeZone() {}
}

/**
 * Cria o ambiente do Apps Script e carrega todos os .gs de apps-script/.
 * Devolve { ctx, emails, trava, propriedades } — ctx tem as funções globais (doPost, prepararTudo_…).
 */
function carregarAppsScript({ convidados, presentes, propriedades = {} }) {
  const emails = [];
  const trava = { livre: true };
  const cache = new Map();
  const planilhas = { [convidados.id]: convidados, [presentes.id]: presentes };
  const ui = encadeavel({ alert: () => 'YES', Button: { YES: 'YES', OK: 'OK' }, ButtonSet: {} });

  const ctx = vm.createContext({
    console,
    SpreadsheetApp: encadeavel({
      getActive: () => convidados,
      getActiveSpreadsheet: () => convidados,
      openById: id => { if (!planilhas[id]) throw new Error('Planilha não encontrada: ' + id); return planilhas[id]; },
      flush: () => {},
      newDataValidation: () => construtor('validacao'),
      newConditionalFormatRule: () => construtor('cor'),
      getUi: () => ui,
      ProtectionType: { RANGE: 'RANGE' }
    }),
    LockService: { getScriptLock: () => ({ tryLock: () => trava.livre, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => propriedades[k] || null, setProperty: (k, v) => { propriedades[k] = v; } }) },
    Utilities: {
      computeHmacSha256Signature: (valor, chave) => Array.from(crypto.createHmac('sha256', chave).update(valor, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      formatDate: d => d.toISOString(),
      getUuid: () => crypto.randomUUID(),
      Charset: { UTF_8: 'UTF_8' }
    },
    ContentService: {
      createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }),
      MimeType: { JSON: 'JSON' }
    },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => { cache.set(k, v); } }) },
    MailApp: { sendEmail: (para, assunto, corpo) => emails.push({ para, assunto, corpo }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }) },
    DriveApp: encadeavel({}),
    ScriptApp: encadeavel({ getProjectTriggers: () => [] })
  });

  const pasta = path.join(__dirname, '..', '..', 'apps-script');
  fs.readdirSync(pasta).filter(f => f.endsWith('.gs')).sort().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(pasta, f), 'utf8'), ctx, { filename: f });
  });
  return { ctx, emails, trava, propriedades };
}

module.exports = { Planilha, Aba, carregarAppsScript };
