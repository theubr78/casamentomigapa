/* Painel dos noivos: convidados, presentes e escolhas dos convidados. */
(function () {
  'use strict';
  const API = ((window.SITE_CONFIG || {}).apiBase || '').replace(/\/$/, '');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paraCentavos = v => Math.round(Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) * 100);
  const dataBR = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  let token = '';
  try { token = sessionStorage.getItem('painel-token') || ''; } catch (e) {}
  let convites = [];

  async function api(caminho, o) {
    o = Object.assign({ headers: {} }, o);
    o.headers.Authorization = 'Bearer ' + token;
    if (o.body && typeof o.body !== 'string') { o.body = JSON.stringify(o.body); o.headers['Content-Type'] = 'application/json'; }
    let r;
    try { r = await fetch(API + '/api/admin' + caminho, o); }
    catch (e) { throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'); }
    const falha = m => Object.assign(new Error(m), { status: r.status });
    if (r.status === 401) { sair(); throw falha('Senha incorreta. Confira e tente de novo.'); }
    if (!r.ok) { let m = 'Erro ' + r.status; try { m = (await r.json()).mensagem || m; } catch (e) {} throw falha(m); }
    if (r.status === 204) return null;
    return (r.headers.get('content-type') || '').includes('json') ? r.json() : r.text();
  }

  let tToast;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true; }, 3200); }
  const falhou = e => toast(e.message || 'Algo deu errado. Tente de novo.');

  // ---------- entrar / sair ----------
  function mostrar(painel) { $('#tela-entrar').hidden = painel; $('#tela-painel').hidden = !painel; }
  function sair() { token = ''; try { sessionStorage.removeItem('painel-token'); } catch (e) {} mostrar(false); $('#token').focus(); }
  $('#sair').addEventListener('click', sair);
  $('#form-entrar').addEventListener('submit', async e => {
    e.preventDefault();
    token = $('#token').value.trim();
    const erro = $('#erro-entrar'); erro.hidden = true;
    try {
      await api('/resumo');
      try { sessionStorage.setItem('painel-token', token); } catch (err) {}
      mostrar(true); carregarTudo();
    } catch (err) { erro.textContent = err.message; erro.hidden = false; } // senha errada, painel desativado, sem conexão…
  });

  // ---------- abas ----------
  $$('.abas [data-aba]').forEach(b => b.addEventListener('click', () => {
    $$('.abas [data-aba]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-painel]').forEach(p => { p.hidden = p.dataset.painel !== b.dataset.aba; });
  }));

  // ---------- resumo ----------
  async function carregarResumo() {
    const r = await api('/resumo');
    const n = (v, rot, cls) => '<div class="numero ' + (cls || '') + '"><b>' + v + '</b><span>' + rot + '</span></div>';
    $('#numeros').innerHTML =
      n(r.vao, 'Vão', 'numero--destaque') + n(r.naoVao, 'Não vão') + n(r.pendentes, 'Pendentes') +
      n(r.convitesRespondidos + '/' + r.convites, 'Convites respondidos') + n(r.convidados, 'Convidados') +
      n(r.presentesComprar, 'Presentes a comprar') + n(reais(r.valorPixPrometido), 'Pix avisados') +
      n(r.escolhasAConferir, 'A conferir');
  }

  // ---------- convidados ----------
  async function carregarConvites() { convites = await api('/convites'); renderConvites(); }
  function renderConvites() {
    const n = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = n($('#filtro-texto').value).trim();
    const st = $('#filtro-status').value;
    const lista = convites.filter(c => {
      const textoOk = !q || n(c.rotulo).includes(q) || c.convidados.some(p => n(p.nome).includes(q));
      const stOk = !st || c.convidados.some(p => (st === 'pendente' ? !p.status : p.status === st));
      return textoOk && stOk;
    });
    if (!lista.length) {
      $('#lista-convites').innerHTML = '<div class="vazio">' + (convites.length ? 'Nenhum convite com esse filtro.' : 'Nenhum convite ainda. Importe o CSV ou adicione o primeiro convite acima.') + '</div>';
      return;
    }
    $('#lista-convites').innerHTML = lista.map(c =>
      '<article class="convite" data-convite="' + c.id + '">' +
        '<div class="convite__cabeca"><h3>' + esc(c.rotulo) + '</h3>' +
        '<span class="convite__meta">' + (c.respondido_em ? 'Respondido em ' + dataBR(c.respondido_em) : 'Sem resposta') + (c.observacao ? ' · ' + esc(c.observacao) : '') + '</span></div>' +
        c.convidados.map(p =>
          '<div class="pessoa" data-pessoa="' + p.id + '">' +
            '<span class="pessoa__nome">' + esc(p.nome) + '</span>' +
            '<select aria-label="Status de ' + esc(p.nome) + '" data-valor="' + (p.status || '') + '">' +
              '<option value=""' + (!p.status ? ' selected' : '') + '>Pendente</option>' +
              '<option value="vai"' + (p.status === 'vai' ? ' selected' : '') + '>Vai</option>' +
              '<option value="nao"' + (p.status === 'nao' ? ' selected' : '') + '>Não vai</option>' +
            '</select>' +
            '<button class="btn btn--perigo" data-remover-pessoa="' + p.id + '" data-nome="' + esc(p.nome) + '">Remover</button>' +
          '</div>'
        ).join('') +
        '<div class="convite__rodape">' +
          '<form data-add-pessoa="' + c.id + '"><input name="nome" placeholder="Adicionar pessoa a este convite" aria-label="Adicionar pessoa ao convite ' + esc(c.rotulo) + '"><button class="btn btn--contorno btn--sm">Adicionar</button></form>' +
          '<button class="btn btn--perigo" data-remover-convite="' + c.id + '">Excluir convite</button>' +
        '</div>' +
      '</article>'
    ).join('');
  }
  $('#filtro-texto').addEventListener('input', renderConvites);
  $('#filtro-status').addEventListener('change', renderConvites);

  $('#lista-convites').addEventListener('change', async e => {
    const sel = e.target.closest('.pessoa select');
    if (!sel) return;
    try {
      await api('/convidados/' + sel.closest('[data-pessoa]').dataset.pessoa, { method: 'PATCH', body: { status: sel.value || null } });
      sel.dataset.valor = sel.value; toast('Status atualizado.');
      carregarResumo(); carregarConvites();
    } catch (err) { falhou(err); }
  });
  $('#lista-convites').addEventListener('click', async e => {
    const rp = e.target.closest('[data-remover-pessoa]'), rc = e.target.closest('[data-remover-convite]');
    try {
      if (rp) {
        if (!confirm('Remover ' + rp.dataset.nome + ' da lista de convidados?')) return;
        await api('/convidados/' + rp.dataset.removerPessoa, { method: 'DELETE' }); toast(rp.dataset.nome + ' removido(a).');
      } else if (rc) {
        const c = convites.find(x => String(x.id) === rc.dataset.removerConvite);
        if (!confirm('Excluir o convite "' + c.rotulo + '" e ' + c.convidados.length + ' convidado(s)? Isso não pode ser desfeito.')) return;
        await api('/convites/' + c.id, { method: 'DELETE' }); toast('Convite "' + c.rotulo + '" excluído.');
      } else return;
      carregarResumo(); carregarConvites();
    } catch (err) { falhou(err); }
  });
  $('#lista-convites').addEventListener('submit', async e => {
    const f = e.target.closest('[data-add-pessoa]');
    if (!f) return;
    e.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) return;
    try { await api('/convites/' + f.dataset.addPessoa + '/convidados', { method: 'POST', body: { nome } }); toast(nome + ' adicionado(a).'); carregarResumo(); carregarConvites(); }
    catch (err) { falhou(err); }
  });

  $('#form-convite').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const nomes = f.nomes.value.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      await api('/convites', { method: 'POST', body: { rotulo: f.rotulo.value.trim(), nomes, observacao: f.observacao.value.trim() || null } });
      f.reset(); toast('Convite adicionado.'); carregarResumo(); carregarConvites();
    } catch (err) { falhou(err); }
  });

  // O Excel em português salva "CSV (separado por vírgulas)" em Windows-1252, não em UTF-8.
  // Tenta UTF-8; se o arquivo não for UTF-8 válido, lê como Windows-1252 (acentos certos nos dois casos).
  async function lerTextoCsv(arq) {
    const bytes = await arq.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }
  $('#importar-csv').addEventListener('change', async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      const r = await api('/importar', { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8' }, body: await lerTextoCsv(arq) });
      toast(r.convitesCriados + ' convites criados, ' + r.convidadosAdicionados + ' convidados adicionados.');
      const avisos = [];
      if (r.repetidosIgnorados) avisos.push(r.repetidosIgnorados + ' nome(s) repetido(s) ou já cadastrado(s) foram ignorados.');
      if (r.linhasIgnoradas.length) avisos.push('Linhas sem convite ou sem nome (ignoradas): ' + r.linhasIgnoradas.join(', ') + '.');
      if (r.emOutroConvite.length) avisos.push('Estes nomes já existem em outro convite — na busca do site vão aparecer como “ambíguo”. Confira se não é a mesma pessoa:\n' +
        r.emOutroConvite.map(x => '• ' + x.nome + ' (também em “' + x.convite + '”)').join('\n'));
      if (avisos.length) alert('Importação concluída.\n\n' + avisos.join('\n\n'));
      carregarResumo(); carregarConvites();
    } catch (err) { falhou(err); } finally { e.target.value = ''; }
  });
  $('#exportar-csv').addEventListener('click', async () => {
    try {
      // r.text() remove o BOM; sem ele o Excel abre os acentos errados ("JoÃ£o"). Recoloca aqui.
      const csv = (await api('/exportar.csv')).replace(/^\uFEFF/, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'convidados-' + new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + '.csv';
      a.click(); URL.revokeObjectURL(a.href);
    } catch (err) { falhou(err); }
  });

  // ---------- presentes ----------
  async function carregarPresentes() {
    const lista = await api('/presentes');
    $('#tabela-presentes').innerHTML =
      '<thead><tr><th>Ordem</th><th>Nome</th><th class="num">Valor (R$)</th><th class="num">Qtd.</th><th>Foto</th><th>Link da loja</th><th>Ativo</th><th>Escolhas</th><th></th></tr></thead><tbody>' +
      (lista.length ? lista.map(p =>
        '<tr data-presente="' + p.id + '">' +
          '<td style="width:76px"><input name="ordem" type="number" value="' + p.ordem + '" aria-label="Ordem"></td>' +
          '<td><input name="nome" value="' + esc(p.nome) + '" aria-label="Nome"></td>' +
          '<td style="width:120px"><input name="valor" class="num" value="' + (p.valor / 100).toFixed(2).replace('.', ',') + '" aria-label="Valor"></td>' +
          '<td style="width:76px"><input name="quantidade" type="number" min="0" class="num" value="' + p.quantidade + '" aria-label="Quantidade para comprar"></td>' +
          '<td><input name="imagem" value="' + esc(p.imagem || '') + '" aria-label="Foto"></td>' +
          '<td><input name="linkLoja" value="' + esc(p.link_loja || '') + '" aria-label="Link da loja"></td>' +
          '<td><input name="ativo" type="checkbox"' + (p.ativo ? ' checked' : '') + ' aria-label="Ativo" style="width:auto;min-height:0"></td>' +
          '<td style="white-space:nowrap">' + (p.quantidade > 0 ? p.comprar + '/' + p.quantidade + ' reservado' : 'só Pix') + ' · ' + p.pix + ' Pix</td>' +
          '<td style="white-space:nowrap"><button class="btn btn--contorno btn--sm" data-salvar>Salvar</button> <button class="btn btn--perigo" data-excluir>Excluir</button></td>' +
        '</tr>').join('')
      : '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--oliva)">Nenhum presente cadastrado. Adicione o primeiro acima.</td></tr>') + '</tbody>';
  }
  $('#tabela-presentes').addEventListener('click', async e => {
    const tr = e.target.closest('[data-presente]');
    if (!tr) return;
    const v = n => tr.querySelector('[name="' + n + '"]');
    try {
      if (e.target.closest('[data-salvar]')) {
        await api('/presentes/' + tr.dataset.presente, { method: 'PATCH', body: {
          ordem: v('ordem').value, nome: v('nome').value, valor: paraCentavos(v('valor').value),
          quantidade: v('quantidade').value, imagem: v('imagem').value || null, linkLoja: v('linkLoja').value || null, ativo: v('ativo').checked
        } });
        toast('Presente salvo.'); carregarPresentes();
      } else if (e.target.closest('[data-excluir]')) {
        if (!confirm('Excluir o presente "' + v('nome').value + '"? As escolhas já feitas continuam no histórico.')) return;
        await api('/presentes/' + tr.dataset.presente, { method: 'DELETE' }); toast('Presente excluído.'); carregarPresentes();
      }
    } catch (err) { falhou(err); }
  });
  $('#form-presente').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/presentes', { method: 'POST', body: {
        nome: f.nome.value, valor: paraCentavos(f.valor.value), quantidade: f.quantidade.value, ordem: f.ordem.value,
        imagem: f.imagem.value || null, linkLoja: f.linkLoja.value || null
      } });
      f.reset(); toast('Presente adicionado.'); carregarPresentes();
    } catch (err) { falhou(err); }
  });

  // ---------- escolhas dos convidados ----------
  async function carregarEscolhas() {
    const lista = await api('/escolhas');
    $('#tabela-escolhas').innerHTML =
      '<thead><tr><th>Data</th><th>Quem</th><th>Presente</th><th class="num">Valor</th><th>Como</th><th>Recado</th><th>Conferido</th><th></th></tr></thead><tbody>' +
      (lista.length ? lista.map(r =>
        '<tr data-escolha="' + r.id + '"' + (r.conferido ? ' class="conferido"' : '') + '>' +
          '<td style="white-space:nowrap">' + dataBR(r.criado_em) + '</td><td>' + esc(r.nome) + '</td><td>' + esc(r.presente || '—') + '</td>' +
          '<td class="num">' + (r.valor ? reais(r.valor) : '—') + '</td>' +
          '<td style="white-space:nowrap">' + (r.modo === 'comprar' ? 'Vai comprar' : 'Pix') + '</td><td>' + esc(r.mensagem || '') + '</td>' +
          '<td><input type="checkbox" aria-label="Conferido"' + (r.conferido ? ' checked' : '') + ' style="width:auto;min-height:0"></td>' +
          '<td><button class="btn btn--perigo" data-excluir-escolha data-nome="' + esc(r.nome) + '" data-presente-nome="' + esc(r.presente || '') + '">Excluir</button></td>' +
        '</tr>').join('')
      : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--oliva)">Nenhuma escolha ainda.</td></tr>') + '</tbody>';
  }
  $('#tabela-escolhas').addEventListener('change', async e => {
    const tr = e.target.closest('[data-escolha]');
    if (!tr) return;
    try { await api('/escolhas/' + tr.dataset.escolha, { method: 'PATCH', body: { conferido: e.target.checked } }); tr.classList.toggle('conferido', e.target.checked); carregarResumo(); }
    catch (err) { falhou(err); }
  });
  $('#tabela-escolhas').addEventListener('click', async e => {
    const b = e.target.closest('[data-excluir-escolha]');
    if (!b) return;
    if (!confirm('Excluir a escolha de ' + b.dataset.nome + ' (' + b.dataset.presenteNome + ')? Se era uma reserva, o presente volta a ficar disponível no site.')) return;
    try { await api('/escolhas/' + b.closest('[data-escolha]').dataset.escolha, { method: 'DELETE' }); toast('Escolha excluída.'); carregarResumo(); carregarEscolhas(); carregarPresentes(); }
    catch (err) { falhou(err); }
  });

  // ---------- início ----------
  function carregarTudo() { Promise.all([carregarResumo(), carregarConvites(), carregarPresentes(), carregarEscolhas()]).catch(falhou); }
  if (token) { api('/resumo').then(() => { mostrar(true); carregarTudo(); }).catch(() => mostrar(false)); }
  else mostrar(false);
})();
