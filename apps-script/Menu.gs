/**
 * Menu "Casamento" na planilha de convidados: configurar, preparar as planilhas,
 * conferir nomes e backup. Tudo aqui pode ser rodado mais de uma vez sem estragar nada.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Casamento')
    .addItem('1. Configurar', 'configurar')
    .addItem('2. Preparar planilhas', 'prepararPlanilhas')
    .addSeparator()
    .addItem('Conferir nomes dos convidados', 'conferirNomes')
    .addItem('Fazer backup agora', 'fazerBackup')
    .addItem('Mostrar segredo da API', 'mostrarSegredo')
    .addToUi();
}

// ---------- 1. Configurar ----------

/** Pergunta o link da planilha de presentes e cria o segredo da API (se ainda não existir). */
function configurar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var atual = props.getProperty(PROPRIEDADES.ID_PRESENTES);
  var r = ui.prompt('Planilha de PRESENTES',
    'Cole o link da planilha de presentes que este site deve usar' +
    (atual ? ' (hoje: ' + atual + '). Deixe em branco para manter.' : '.'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  var texto = r.getResponseText().trim();
  if (texto) {
    var m = texto.match(/\/d\/([A-Za-z0-9_-]{20,})/) || texto.match(/^([A-Za-z0-9_-]{20,})$/);
    if (!m) return ui.alert('Não reconheci o link. Copie o endereço completo da planilha de presentes.');
    var planilha;
    try { planilha = SpreadsheetApp.openById(m[1]); } catch (e) { return ui.alert('Não consegui abrir essa planilha. Ela é sua, ou está compartilhada com você como editor?'); }
    if (!planilha.getSheetByName(ABAS.PRESENTES)) return ui.alert('A planilha "' + planilha.getName() + '" não tem a aba "' + ABAS.PRESENTES + '".');
    props.setProperty(PROPRIEDADES.ID_PRESENTES, m[1]);
  }
  if (!props.getProperty(PROPRIEDADES.SEGREDO)) props.setProperty(PROPRIEDADES.SEGREDO, novoSegredo_());

  ui.alert('Configurado',
    'Planilha de presentes: ' + planilhaPresentes_().getName() + '\n\n' +
    'Agora use "2. Preparar planilhas". Depois de implantar como App da Web, copie o segredo ' +
    '(menu "Mostrar segredo da API") para o Netlify.', ui.ButtonSet.OK);
}

function novoSegredo_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function mostrarSegredo() {
  var s = propriedade_(PROPRIEDADES.SEGREDO);
  SpreadsheetApp.getUi().alert('Segredo da API',
    s ? s + '\n\nCopie para o Netlify na variável APPS_SCRIPT_SEGREDO. Não compartilhe com ninguém.' : 'Ainda não existe. Use "1. Configurar".',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---------- 2. Preparar planilhas ----------

function prepararPlanilhas() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Preparar planilhas',
    'Primeiro vou fazer um BACKUP das duas planilhas (pasta "' + PASTA_BACKUPS + '" no seu Drive). ' +
    'Depois ajusto a estrutura: colunas novas, IDs, abas Escolhas, Respostas e Resumo, fórmulas e proteções. ' +
    'Os dados dos convidados e presentes não são apagados. Continuar?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  fazerBackup_();
  var relatorio = prepararTudo_();
  ativarBackupDiario_();
  ui.alert('Planilhas preparadas', relatorio.join('\n') + '\n\nBackup diário automático: ativado (3h da manhã).', ui.ButtonSet.OK);
}

/** Sem interface (usado pelo menu e pelos testes). Devolve o relatório do que foi feito. */
function prepararTudo_() {
  return comTrava_(function () {
    return prepararConvidados_(planilhaConvidados_()).concat(prepararPresentes_(planilhaPresentes_()));
  });
}

/** Linha do cabeçalho que contém todos estes textos. */
function acharCabecalho_(aba, textos) {
  var n = Math.max(1, Math.min(LINHAS_PROCURA_CABECALHO_, aba.getLastRow()));
  var topo = aba.getRange(1, 1, n, Math.max(1, aba.getLastColumn())).getValues();
  for (var i = 0; i < topo.length; i++) {
    var linha = topo[i].map(norm_);
    if (textos.every(function (t) { return linha.indexOf(norm_(t)) >= 0; })) return i + 1;
  }
  throw new ErroEstrutura('Não achei o cabeçalho (' + textos.join(', ') + ') na aba "' + aba.getName() + '".');
}

/** Acrescenta no fim do cabeçalho as colunas que faltam. Devolve os nomes criados. */
function garantirColunas_(aba, linhaCab, nomes) {
  var ultima = aba.getLastColumn();
  var existentes = aba.getRange(linhaCab, 1, 1, ultima).getValues()[0].map(norm_);
  var col = ultima, criadas = [];
  nomes.forEach(function (n) {
    if (existentes.indexOf(norm_(n)) >= 0) return;
    col++;
    aba.getRange(linhaCab, col).setValue(n);
    aba.getRange(linhaCab, ultima).copyFormatToRange(aba, col, col, linhaCab, linhaCab);
    criadas.push(n);
  });
  if (criadas.length) {
    // o filtro passa a cobrir as colunas novas
    var filtro = aba.getFilter();
    if (filtro) {
      var r = filtro.getRange();
      filtro.remove();
      aba.getRange(r.getRow(), 1, aba.getMaxRows() - r.getRow() + 1, col).createFilter();
    }
  }
  return criadas;
}

/** Aba com cabeçalho na linha 1; cria se não existir e acrescenta colunas que faltarem. */
function garantirAba_(planilha, nome, cabecalhos) {
  var aba = planilha.getSheetByName(nome);
  var criada = false;
  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]).setFontWeight('bold');
    aba.setFrozenRows(1);
    criada = true;
  } else {
    var existentes = aba.getRange(1, 1, 1, Math.max(1, aba.getLastColumn())).getValues()[0].map(norm_);
    var col = aba.getLastColumn();
    cabecalhos.forEach(function (c) {
      if (existentes.indexOf(norm_(c)) < 0) { col++; aba.getRange(1, col).setValue(c).setFontWeight('bold'); }
    });
  }
  return { aba: aba, criada: criada };
}

/** Proteção só de AVISO: o Sheets pergunta "tem certeza?" antes de alguém editar à mão. */
function protegerComAviso_(aba, intervalo, descricao) {
  aba.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === descricao) p.remove();
  });
  intervalo.protect().setDescription(descricao).setWarningOnly(true);
}

// ---------- convidados ----------

function prepararConvidados_(planilha) {
  var rel = [];
  planilha.setSpreadsheetTimeZone(FUSO);
  var aba = aba_(planilha, ABAS.CONVIDADOS);
  var linhaCab = acharCabecalho_(aba, [COLUNAS.CONVIDADOS.nome, COLUNAS.CONVIDADOS.presenca]);

  var criancas = removerResumoAntigo_(aba, linhaCab, rel);

  var criadas = garantirColunas_(aba, linhaCab, ['Outros nomes', 'Convite', 'Respondido em', 'Origem', 'ID']);
  if (criadas.length) rel.push('Convidados: colunas criadas — ' + criadas.join(', ') + '.');

  var t = lerConvidados_();
  var ids = atribuirIds_(t, 'nome', PREFIXO_ID.CONVIDADO);
  rel.push('Convidados: ' + t.linhas.filter(function (l) { return texto_(l.v.nome); }).length + ' pessoas' + (ids ? ', ' + ids + ' IDs criados.' : '.'));

  var primeira = t.linhaCab + 1, n = aba.getMaxRows() - t.linhaCab;
  aba.getRange(primeira, t.col.presenca, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([PRESENCA.SIM, PRESENCA.PENDENTE, PRESENCA.NAO], true).setAllowInvalid(false).build());
  aba.getRange(primeira, t.col.respondidoEm, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  corrigirCoresConvidados_(aba, primeira, n);

  protegerComAviso_(aba, aba.getRange(primeira, t.col.id, n, 1), 'Site: ID do convidado (automático). Não altere.');
  protegerComAviso_(aba, aba.getRange(primeira, t.col.respondidoEm, n, 1), 'Site: data da resposta pelo site.');
  protegerComAviso_(aba, aba.getRange(primeira, t.col.origem, n, 1), 'Site: origem da resposta.');

  var resp = garantirAba_(planilha, ABAS.RESPOSTAS, valores_(COLUNAS.RESPOSTAS));
  if (resp.criada) rel.push('Convidados: aba "Respostas" criada (histórico de cada resposta pelo site).');
  resp.aba.getRange(2, 1, resp.aba.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  protegerComAviso_(resp.aba, resp.aba.getRange(1, 1, resp.aba.getMaxRows(), resp.aba.getMaxColumns()), 'Site: histórico de respostas. Não altere.');

  montarResumoConvidados_(planilha, aba, linhaCab, criancas);
  rel.push('Convidados: aba "Resumo" atualizada.');
  return rel;
}

/**
 * O resumo ficava embaixo da lista, na mesma aba — o site leria "Resumo", "Adultos"… como convidados.
 * Ele vai para a aba "Resumo". Os números de crianças digitados à mão são preservados.
 */
function removerResumoAntigo_(aba, linhaCab, rel) {
  var colNome = mapearCabecalho_(aba.getRange(linhaCab, 1, 1, aba.getLastColumn()).getValues()[0], { nome: COLUNAS.CONVIDADOS.nome }).nome;
  var ultima = aba.getLastRow();
  if (ultima <= linhaCab) return null;
  var nomes = aba.getRange(linhaCab + 1, colNome, ultima - linhaCab, 3).getValues();
  var inicio = -1, criancas = null;
  for (var i = 1; i < nomes.length; i++) {
    var anteriorVazio = texto_(nomes[i - 1][0]) === '';
    if (inicio < 0 && anteriorVazio && norm_(nomes[i][0]) === 'resumo') inicio = i;
    if (inicio >= 0 && norm_(nomes[i][0]) === 'criancas') criancas = { meninas: nomes[i][1], meninos: nomes[i][2] };
  }
  if (inicio < 0) return null;
  aba.deleteRows(linhaCab + 1 + inicio, ultima - (linhaCab + inicio));
  rel.push('Convidados: o resumo que ficava embaixo da lista foi para a aba "Resumo".');
  return criancas;
}

function corrigirCoresConvidados_(aba, primeira, n) {
  // As cores vieram do Excel com a regra "número igual a", que não funciona com texto. Refaz como "texto igual a".
  var cab = aba.getRange(primeira - 1, 1, 1, aba.getLastColumn()).getValues()[0];
  var mapa = mapearCabecalho_(cab, { presenca: COLUNAS.CONVIDADOS.presenca, save: 'Save the date' });
  var cols = [mapa.presenca, mapa.save].filter(Boolean);
  var mantidas = aba.getConditionalFormatRules().filter(function (r) {
    return !r.getRanges().some(function (rg) { return cols.indexOf(rg.getColumn()) >= 0; });
  });
  var regra = function (col, texto, fundo, cor, estilo) {
    var b = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(texto)
      .setBackground(fundo).setFontColor(cor).setRanges([aba.getRange(primeira, col, n, 1)]);
    if (estilo === 'negrito') b = b.setBold(true);
    if (estilo === 'riscado') b = b.setStrikethrough(true);
    return b.build();
  };
  var novas = [];
  if (mapa.save) {
    novas.push(regra(mapa.save, 'Enviado', '#D7E4C0', '#3F4F1E', 'negrito'));
    novas.push(regra(mapa.save, 'Não enviado', '#EBC7D0', '#701331'));
  }
  if (mapa.presenca) {
    novas.push(regra(mapa.presenca, PRESENCA.SIM, '#D7E4C0', '#3F4F1E', 'negrito'));
    novas.push(regra(mapa.presenca, PRESENCA.PENDENTE, '#EBC7D0', '#701331'));
    novas.push(regra(mapa.presenca, PRESENCA.NAO, '#D9D4CF', '#5A5050', 'riscado'));
  }
  aba.setConditionalFormatRules(mantidas.concat(novas));
}

function montarResumoConvidados_(planilha, abaLista, linhaCab, criancas) {
  var cab = abaLista.getRange(linhaCab, 1, 1, abaLista.getLastColumn()).getValues()[0];
  var m = mapearCabecalho_(cab, { nome: 'Nome', presenca: 'Presença', origem: 'Origem', save: 'Save the date', sexo: 'Sexo' });
  var faixa = function (col) { return "'" + ABAS.CONVIDADOS + "'!" + letra_(col) + (linhaCab + 1) + ':' + letra_(col); };

  var aba = planilha.getSheetByName(ABAS.RESUMO_CONVIDADOS);
  if (aba && !criancas) {
    // preserva o que foi digitado à mão (crianças) se o resumo já existia
    var antigos = aba.getRange(1, 1, Math.max(1, aba.getLastRow()), 3).getValues();
    antigos.forEach(function (l) { if (norm_(l[0]) === 'criancas') criancas = { meninas: l[1], meninos: l[2] }; });
  }
  if (!aba) aba = planilha.insertSheet(ABAS.RESUMO_CONVIDADOS);
  aba.clear();

  var linhas = [
    ['Resumo da lista de convidados', '', '', ''],
    ['Atualiza sozinho. Só os números de crianças são digitados.', '', '', ''],
    ['Presença', 'Pessoas', '', ''],
    ['Confirmados', '=COUNTIF(' + faixa(m.presenca) + ',"' + PRESENCA.SIM + '")', '', ''],
    ['Não vão', '=COUNTIF(' + faixa(m.presenca) + ',"' + PRESENCA.NAO + '")', '', ''],
    ['Ainda sem resposta', '=B8-B4-B5', '', ''],
    ['', '', '', ''],
    ['Total na lista', '=COUNTA(' + faixa(m.nome) + ')', '', ''],
    ['Esperados (total menos quem não vai)', '=B8-B5', '', ''],
    ['Responderam pelo site', m.origem ? '=COUNTIF(' + faixa(m.origem) + ',"Site")' : '', '', '']
  ];
  if (m.save) {
    linhas.push(['', '', '', ''], ['Save the date', 'Pessoas', '', ''],
      ['Enviado', '=COUNTIF(' + faixa(m.save) + ',"Enviado")', '', ''],
      ['Não enviado', '=COUNTIF(' + faixa(m.save) + ',"Não enviado")', '', '']);
  }
  if (m.sexo) {
    var base = linhas.length + 2; // linha (1-based) do cabeçalho "Mulheres/Homens"
    linhas.push(['', '', '', ''], ['Pessoas', 'Mulheres', 'Homens', 'Total'],
      ['Adultos', '=B' + (base + 3) + '-B' + (base + 2), '=C' + (base + 3) + '-C' + (base + 2), '=B' + (base + 1) + '+C' + (base + 1)],
      ['Crianças', criancas ? criancas.meninas : '', criancas ? criancas.meninos : '', '=B' + (base + 2) + '+C' + (base + 2)],
      ['Total', '=COUNTIF(' + faixa(m.sexo) + ',"F")', '=COUNTIF(' + faixa(m.sexo) + ',"M")', '=B' + (base + 3) + '+C' + (base + 3)]);
  }
  escreverGrade_(aba, linhas);
  aba.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  aba.setColumnWidth(1, 300);
}

// ---------- presentes ----------

function prepararPresentes_(planilha) {
  var rel = [];
  planilha.setSpreadsheetTimeZone(FUSO);
  var aba = aba_(planilha, ABAS.PRESENTES);
  var linhaCab = acharCabecalho_(aba, [COLUNAS.PRESENTES.nome, COLUNAS.PRESENTES.tipo]);

  // a linha "TOTAL DA LISTA" seria lida como presente; o total já está na aba Resumo
  var colNome = mapearCabecalho_(aba.getRange(linhaCab, 1, 1, aba.getLastColumn()).getValues()[0], { nome: COLUNAS.PRESENTES.nome }).nome;
  var ultima = aba.getLastRow();
  if (ultima > linhaCab) {
    var nomes = aba.getRange(linhaCab + 1, colNome, ultima - linhaCab, 1).getValues();
    for (var i = nomes.length - 1; i >= 0; i--) {
      if (norm_(nomes[i][0]) === 'total da lista') { aba.deleteRow(linhaCab + 1 + i); rel.push('Presentes: linha "TOTAL DA LISTA" removida (o total está na aba Resumo).'); }
    }
  }

  var criadas = garantirColunas_(aba, linhaCab, ['Mostrar no site', 'ID']);
  if (criadas.length) rel.push('Presentes: colunas criadas — ' + criadas.join(', ') + '.');

  var esc = garantirAba_(planilha, ABAS.ESCOLHAS, valores_(COLUNAS.ESCOLHAS));
  if (esc.criada) rel.push('Presentes: aba "Escolhas" criada (cada reserva e cada aviso de Pix).');
  var te = lerEscolhas_();
  var nE = esc.aba.getMaxRows() - 1;
  [te.col.conferido, te.col.cancelado].forEach(function (c) {
    esc.aba.getRange(2, c, nE, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  });
  esc.aba.getRange(2, te.col.data, nE, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  esc.aba.getRange(2, te.col.valor, nE, 1).setNumberFormat('#,##0.00');
  protegerComAviso_(esc.aba, esc.aba.getRange(1, 1, esc.aba.getMaxRows(), te.col.recado),
    'Site: escolhas registradas pelo site. Para liberar um presente, marque "Cancelado" (não apague a linha).');

  var t = lerPresentes_();
  var ids = atribuirIds_(t, 'nome', PREFIXO_ID.PRESENTE);
  rel.push('Presentes: ' + t.linhas.filter(function (l) { return texto_(l.v.nome); }).length + ' itens' + (ids ? ', ' + ids + ' IDs criados.' : '.'));

  var primeira = t.linhaCab + 1, n = aba.getMaxRows() - t.linhaCab;
  aba.getRange(primeira, t.col.mostrar, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Sim', 'Não'], true).setAllowInvalid(false).build());
  t.linhas.forEach(function (l) { if (texto_(l.v.nome) && !texto_(l.v.mostrar)) aba.getRange(l.linha, t.col.mostrar).setValue('Sim'); });

  montarStatusPresentes_(aba, t, te);
  rel.push('Presentes: coluna "Status" agora é calculada a partir da aba Escolhas.');

  protegerComAviso_(aba, aba.getRange(primeira, t.col.id, n, 1), 'Site: ID do presente (automático). Não altere.');

  if (montarResumoPresentes_(planilha, aba, t, te)) rel.push('Presentes: aba "Resumo" passa a somar o recebido pela aba Escolhas.');
  return rel;
}

/**
 * Status calculado (uma fórmula só, no cabeçalho, que cobre também as linhas novas):
 *  Item:     Disponível · "1 de 2 escolhidos" · Escolhido · Recebido (quando conferido)
 *  Cota Pix: "3 de 20 cotas" · Cotas preenchidas
 * Escolhas canceladas não contam.
 */
function montarStatusPresentes_(aba, t, te) {
  var cab = aba.getRange(t.linhaCab, 1, 1, aba.getLastColumn());
  var valores = cab.getValues()[0], formulas = cab.getFormulas()[0];
  var colStatus = 0;
  valores.forEach(function (v, i) {
    if (!colStatus && (norm_(v) === 'status' || /"Status"/.test(formulas[i] || ''))) colStatus = i + 1;
  });
  if (!colStatus) colStatus = garantirColunas_(aba, t.linhaCab, ['Status']).length ? aba.getLastColumn() : 0;

  var h = t.linhaCab;
  var faixa = function (col) { return letra_(col) + h + ':' + letra_(col); };
  var E = function (k) { return ABAS.ESCOLHAS + '!$' + letra_(te.col[k]) + ':$' + letra_(te.col[k]); };
  var ID = faixa(t.col.id), TP = faixa(t.col.tipo), Q = faixa(t.col.qtd);
  var ativos = '(COUNTIFS(' + E('presenteId') + ',' + ID + ')-COUNTIFS(' + E('presenteId') + ',' + ID + ',' + E('cancelado') + ',TRUE))';
  var recebidos = '(COUNTIFS(' + E('presenteId') + ',' + ID + ',' + E('conferido') + ',TRUE)-COUNTIFS(' + E('presenteId') + ',' + ID + ',' + E('conferido') + ',TRUE,' + E('cancelado') + ',TRUE))';
  var formula = '=ARRAYFORMULA(IF(ROW(' + ID + ')=ROW(' + letra_(t.col.id) + h + '),"Status",IF(LEN(' + ID + ')=0,"",' +
    'IF(' + TP + '="' + TIPO.COTA + '",' +
      'IF(' + ativos + '>=' + Q + ',"Cotas preenchidas",' + ativos + '&" de "&' + Q + '&" cotas"),' +
      'IF(' + recebidos + '>=' + Q + ',"Recebido",IF(' + ativos + '>=' + Q + ',"Escolhido",IF(' + ativos + '>0,' + ativos + '&" de "&' + Q + '&" escolhidos","Disponível")))))))';

  aba.getRange(h + 1, colStatus, aba.getMaxRows() - h, 1).clearDataValidations().clearContent();
  definirFormula_(aba.getParent(), aba.getRange(h, colStatus), formula);
  protegerComAviso_(aba, aba.getRange(h, colStatus, aba.getMaxRows() - h + 1, 1), 'Site: status calculado pela aba Escolhas. Não digite aqui.');
}

/** Resumo por categoria: Recebido (conferido) e Escolhido (ativo) passam a vir da aba Escolhas. */
function montarResumoPresentes_(planilha, abaLista, t, te) {
  var aba = planilha.getSheetByName(ABAS.RESUMO_PRESENTES);
  if (!aba) return false;
  var dados = aba.getRange(1, 1, Math.max(1, aba.getLastRow()), Math.max(5, aba.getLastColumn())).getValues();
  var linhaCab = -1, linhaTotal = -1;
  dados.forEach(function (l, i) {
    if (linhaCab < 0 && norm_(l[0]) === 'categoria') linhaCab = i + 1;
    else if (linhaCab > 0 && linhaTotal < 0 && norm_(l[0]) === 'total') linhaTotal = i + 1;
  });
  if (linhaCab < 0 || linhaTotal < 0) return false;

  var h = t.linhaCab + 1;
  var L = function (col) { return "'" + ABAS.PRESENTES + "'!$" + letra_(col) + '$' + h + ':$' + letra_(col); };
  var E = function (k) { return ABAS.ESCOLHAS + '!$' + letra_(te.col[k]) + ':$' + letra_(te.col[k]); };
  aba.getRange(linhaCab, 6).setValue('Escolhido (R$)');
  aba.getRange(linhaCab, 5).copyFormatToRange(aba, 6, 6, linhaCab, linhaCab);
  for (var r = linhaCab + 1; r < linhaTotal; r++) {
    var A = 'A' + r;
    var f = function (col, formula) { definirFormula_(planilha, aba.getRange(r, col), formula); };
    f(2, '=COUNTIF(' + L(t.col.categoria) + ',' + A + ')');
    if (t.col.total) f(3, '=SUMIF(' + L(t.col.categoria) + ',' + A + ',' + L(t.col.total) + ')');
    f(4, '=SUMIFS(' + E('valor') + ',' + E('categoria') + ',' + A + ',' + E('conferido') + ',TRUE)-SUMIFS(' +
      E('valor') + ',' + E('categoria') + ',' + A + ',' + E('conferido') + ',TRUE,' + E('cancelado') + ',TRUE)');
    f(6, '=SUMIFS(' + E('valor') + ',' + E('categoria') + ',' + A + ')-SUMIFS(' +
      E('valor') + ',' + E('categoria') + ',' + A + ',' + E('cancelado') + ',TRUE)');
  }
  definirFormula_(planilha, aba.getRange(linhaTotal, 6), '=SUM(F' + (linhaCab + 1) + ':F' + (linhaTotal - 1) + ')');
  return true;
}

/** Grava uma grade: textos/números com setValues e fórmulas com definirFormula_. */
function escreverGrade_(aba, linhas) {
  var largura = linhas[0].length;
  aba.getRange(1, 1, linhas.length, largura).setValues(linhas.map(function (l) {
    return l.map(function (v) { return typeof v === 'string' && v.charAt(0) === '=' ? '' : v; });
  }));
  linhas.forEach(function (l, i) {
    l.forEach(function (v, j) { if (typeof v === 'string' && v.charAt(0) === '=') definirFormula_(aba.getParent(), aba.getRange(i + 1, j + 1), v); });
  });
}

// ---------- fórmulas no idioma da planilha ----------
// As fórmulas aqui são escritas com VÍRGULA entre os argumentos. Planilhas em português usam
// PONTO E VÍRGULA. Em vez de supor, testamos uma vez por planilha qual separador ela aceita.

var SEPARADORES_ = {};

function separadorFormulas_(planilha) {
  var id = planilha.getId();
  if (SEPARADORES_[id]) return SEPARADORES_[id];
  var aba = planilha.insertSheet('_teste_formula_' + Date.now());
  try {
    var celula = aba.getRange(1, 1);
    var opcoes = [',', ';'];
    for (var i = 0; i < opcoes.length; i++) {
      var s = opcoes[i];
      celula.setFormula('=IF(TRUE' + s + 'SUM(1' + s + '2)' + s + '0)');
      SpreadsheetApp.flush();
      if (celula.getValue() === 3) return (SEPARADORES_[id] = s);
    }
  } finally {
    planilha.deleteSheet(aba);
  }
  throw new ErroEstrutura('Não consegui descobrir o formato das fórmulas da planilha "' + planilha.getName() + '" (idioma/região).');
}

/** Troca a vírgula entre argumentos pelo separador da planilha (fora de textos "…" e nomes de aba '…'). */
function localizarFormula_(formula, separador) {
  if (separador === ',') return formula;
  var saida = '', aspas = false, apostrofo = false;
  for (var i = 0; i < formula.length; i++) {
    var ch = formula.charAt(i);
    if (ch === '"' && !apostrofo) aspas = !aspas;
    else if (ch === "'" && !aspas) apostrofo = !apostrofo;
    saida += ch === ',' && !aspas && !apostrofo ? separador : ch;
  }
  return saida;
}

function definirFormula_(planilha, intervalo, formula) {
  intervalo.setFormula(localizarFormula_(formula, separadorFormulas_(planilha)));
}

function valores_(obj) {
  return Object.keys(obj).map(function (k) { return obj[k]; });
}

// ---------- conferir nomes ----------

function conferirNomes() {
  var problemas = conferirNomes_();
  SpreadsheetApp.getUi().alert('Conferência dos nomes',
    problemas.length
      ? problemas.length + ' ponto(s) para ajustar — a pessoa pode não conseguir se achar no site:\n\n' + problemas.slice(0, 40).join('\n') +
        (problemas.length > 40 ? '\n… e mais ' + (problemas.length - 40) + '.' : '')
      : 'Tudo certo: todos têm nome e sobrenome, sem repetições.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Lista o que pode impedir alguém de se achar na busca do site. */
function conferirNomes_() {
  var t = lerTabela_(aba_(planilhaConvidados_(), ABAS.CONVIDADOS), COLUNAS.CONVIDADOS, ['nome']);
  var validas = [PRESENCA.SIM, PRESENCA.NAO, PRESENCA.PENDENTE].map(norm_);
  var problemas = [], porNome = {};
  t.linhas.forEach(function (l) {
    var nome = texto_(l.v.nome);
    if (!nome) return;
    var n = norm_(nome), ref = 'Linha ' + l.linha + ' — "' + nome + '"';
    if (n.split(' ').length < 2) problemas.push(ref + ': só uma palavra (falta o sobrenome).');
    if (/^(namorad|esposa|esposo|marido|filh|acompanhante|convidad|amig)/.test(n)) problemas.push(ref + ': não parece o nome da pessoa.');
    if (/[()0-9]/.test(nome)) problemas.push(ref + ': tem parênteses ou números (o convidado não vai digitar isso).');
    var p = texto_(l.v.presenca);
    if (p && validas.indexOf(norm_(p)) < 0) problemas.push(ref + ': Presença "' + p + '" não é uma das opções.');
    var chaves = [n].concat(String(l.v.outros == null ? '' : l.v.outros).split(/[;,\n]/).map(norm_).filter(Boolean));
    chaves.forEach(function (k) { (porNome[k] = porNome[k] || []).push(l.linha); });
  });
  Object.keys(porNome).forEach(function (k) {
    var linhas = porNome[k].filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (linhas.length > 1) problemas.push('Linhas ' + linhas.join(', ') + ': o nome "' + k + '" aparece mais de uma vez — a busca vai dar "ambíguo".');
  });
  return problemas;
}

// ---------- backup ----------

function fazerBackup() {
  var n = fazerBackup_();
  SpreadsheetApp.getUi().alert('Backup feito: ' + n + ' cópias na pasta "' + PASTA_BACKUPS + '" do seu Drive (as com mais de ' + LIMITES.DIAS_BACKUP + ' dias vão para a lixeira).');
}

/** Chamada pelo gatilho diário. */
function backupDiario() {
  try { fazerBackup_(); } catch (e) { alertar_('O backup diário falhou', String(e && e.stack || e)); }
}

function fazerBackup_() {
  var pastas = DriveApp.getFoldersByName(PASTA_BACKUPS);
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_BACKUPS);
  var quando = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd HH.mm');
  var planilhas = [planilhaConvidados_()];
  try { planilhas.push(planilhaPresentes_()); } catch (e) { /* presentes ainda não configurada */ }
  planilhas.forEach(function (p) { DriveApp.getFileById(p.getId()).makeCopy(p.getName() + ' — backup ' + quando, pasta); });
  var limite = Date.now() - LIMITES.DIAS_BACKUP * 24 * 3600 * 1000;
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var a = arquivos.next();
    if (a.getDateCreated().getTime() < limite) a.setTrashed(true);
  }
  return planilhas.length;
}

function ativarBackupDiario_() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'backupDiario'; });
  if (!existe) ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).inTimezone(FUSO).create();
}
