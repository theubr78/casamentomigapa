/**
 * Leitura e gravação de tabelas pelo TEXTO do cabeçalho.
 * Nunca usamos a letra da coluna nem o número da linha como identificação: os noivos podem
 * reordenar, ordenar e inserir linhas e colunas sem quebrar o site.
 */

var LINHAS_PROCURA_CABECALHO_ = 15;

/** { chave: nºcoluna } para as colunas encontradas numa linha de cabeçalho. */
function mapearCabecalho_(valoresLinha, colunas) {
  var porTexto = {};
  valoresLinha.forEach(function (c, i) {
    var t = norm_(c);
    if (t && !(t in porTexto)) porTexto[t] = i + 1;
  });
  var mapa = {};
  Object.keys(colunas).forEach(function (k) {
    var i = porTexto[norm_(colunas[k])];
    if (i) mapa[k] = i;
  });
  return mapa;
}

/**
 * Lê uma tabela.
 * @param aba          aba da planilha
 * @param colunas      { chave: 'Texto do cabeçalho' }
 * @param obrigatorias chaves que precisam existir (senão ErroEstrutura, sem gravar nada)
 * @param opcoes       { links: chave da coluna cujo hiperlink deve ser lido }
 * @return { aba, linhaCab, col: {chave: nº}, ultimaCol, linhas: [{ linha, v: {chave: valor}, link }] }
 */
function lerTabela_(aba, colunas, obrigatorias, opcoes) {
  opcoes = opcoes || {};
  var ultimaCol = Math.max(aba.getLastColumn(), 1);
  var ultimaLinha = aba.getLastRow();
  var nTopo = Math.max(1, Math.min(LINHAS_PROCURA_CABECALHO_, ultimaLinha));
  var topo = aba.getRange(1, 1, nTopo, ultimaCol).getValues();

  var linhaCab = -1, col = null, melhor = { faltando: obrigatorias };
  for (var i = 0; i < topo.length && linhaCab < 0; i++) {
    var mapa = mapearCabecalho_(topo[i], colunas);
    var faltando = obrigatorias.filter(function (k) { return !mapa[k]; });
    if (!faltando.length) { linhaCab = i + 1; col = mapa; }
    else if (faltando.length < melhor.faltando.length) melhor = { faltando: faltando };
  }
  if (linhaCab < 0) {
    throw new ErroEstrutura('Na aba "' + aba.getName() + '" não encontrei as colunas: ' +
      melhor.faltando.map(function (k) { return '"' + colunas[k] + '"'; }).join(', ') +
      '. Confira se o cabeçalho não foi renomeado, ou use o menu Casamento → Preparar planilhas.');
  }

  var n = ultimaLinha - linhaCab;
  var valores = n > 0 ? aba.getRange(linhaCab + 1, 1, n, ultimaCol).getValues() : [];
  var links = opcoes.links && col[opcoes.links] && n > 0
    ? aba.getRange(linhaCab + 1, col[opcoes.links], n, 1).getRichTextValues() : null;

  var linhas = [];
  valores.forEach(function (row, j) {
    if (row.every(function (c) { return c === '' || c === null; })) return; // linha em branco
    var v = {};
    Object.keys(col).forEach(function (k) { v[k] = row[col[k] - 1]; });
    var item = { linha: linhaCab + 1 + j, v: v };
    if (links) {
      var rt = links[j] && links[j][0];
      item.link = rt && rt.getLinkUrl ? (rt.getLinkUrl() || '') : '';
    }
    linhas.push(item);
  });
  return { aba: aba, linhaCab: linhaCab, col: col, ultimaCol: ultimaCol, linhas: linhas };
}

/** Grava algumas células de uma linha: { chave: valor }. */
function escreverCelulas_(tabela, linha, valores) {
  Object.keys(valores).forEach(function (k) {
    if (!tabela.col[k]) throw new ErroEstrutura('Coluna "' + k + '" não encontrada na aba "' + tabela.aba.getName() + '".');
    tabela.aba.getRange(linha, tabela.col[k]).setValue(valores[k]);
  });
}

/** Acrescenta linhas no fim da tabela, cada uma como { chave: valor }, numa única gravação. */
function acrescentarLinhas_(tabela, objetos) {
  if (!objetos.length) return;
  var largura = tabela.ultimaCol;
  var linhas = objetos.map(function (o) {
    var arr = [];
    for (var i = 0; i < largura; i++) arr.push('');
    Object.keys(o).forEach(function (k) {
      if (!tabela.col[k]) throw new ErroEstrutura('Coluna "' + k + '" não encontrada na aba "' + tabela.aba.getName() + '".');
      arr[tabela.col[k] - 1] = o[k];
    });
    return arr;
  });
  var inicio = Math.max(tabela.aba.getLastRow(), tabela.linhaCab) + 1;
  tabela.aba.getRange(inicio, 1, linhas.length, largura).setValues(linhas);
}

/**
 * Dá ID a quem não tem (ou tem ID repetido, por exemplo de uma linha copiada e colada).
 * IDs nunca são reaproveitados: o próximo é sempre o maior existente + 1.
 * @return quantos IDs foram criados
 */
function atribuirIds_(tabela, chaveNome, prefixo) {
  var max = 0;
  tabela.linhas.forEach(function (l) {
    var id = texto_(l.v.id);
    if (id.indexOf(prefixo) === 0) {
      var n = Number(id.slice(prefixo.length));
      if (n > max) max = n;
    }
  });
  var vistos = {}, criados = 0;
  tabela.linhas.forEach(function (l) {
    if (!texto_(l.v[chaveNome])) return;
    var id = texto_(l.v.id);
    if (!id || vistos[id]) {
      id = prefixo + String(++max).padStart(4, '0');
      tabela.aba.getRange(l.linha, tabela.col.id).setValue(id);
      l.v.id = id;
      criados++;
    }
    vistos[id] = true;
  });
  return criados;
}
