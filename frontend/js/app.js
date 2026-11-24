/* =====================================================================
   Millena & Leonardo — comportamento do site (JS puro, sem build).
   Seções: utilidades · API · topo/menu · contagem · revelar · vídeo ·
   trilha · RSVP · presentes/Pix · dicas · início
   ===================================================================== */
(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const API = (CFG.apiBase || '').replace(/\/$/, '');
  const ALVO = new Date(CFG.dataCasamento || '2027-07-03T15:00:00-03:00').getTime();
  const FIM_DIA = new Date(CFG.fimDoDia || '2027-07-04T00:00:00-03:00').getTime();
  const reduzirMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let siteConfig = { whatsapp: '', spotifyUrl: '', youtubeId: '', encerrado: false, prazoTexto: '3 de maio de 2027' };

  // ---------- utilidades ----------
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = centavos => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Só endereços web de verdade (nunca "javascript:"); o backend já valida, isto é a segunda barreira
  const linkSeguro = u => (/^https?:\/\//i.test(String(u || '')) ? u : '');
  const fotoSegura = u => (/^(https:\/\/|assets\/)/i.test(String(u || '')) ? u : '');

  async function api(caminho, opcoes) {
    const o = Object.assign({ headers: {} }, opcoes);
    if (o.body && typeof o.body !== 'string') { o.body = JSON.stringify(o.body); o.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(API + caminho, o);
    let dados = null;
    try { dados = await r.json(); } catch (e) { /* resposta sem JSON */ }
    if (!r.ok) { const err = new Error((dados && dados.mensagem) || 'Erro ' + r.status); err.status = r.status; err.dados = dados; throw err; }
    return dados;
  }

  // Trava a rolagem do body quando há sobreposição aberta
  const travas = new Set();
  function travar(chave, on) { on ? travas.add(chave) : travas.delete(chave); document.body.classList.toggle('travado', travas.size > 0); }

  // Diálogo modal (menu, painel de presente): o resto da página fica "inert" — sem foco, sem clique,
  // fora do leitor de tela — e o Tab dá a volta dentro do diálogo.
  let dialogoAberto = null;
  function isolar(dialogo, on) {
    dialogoAberto = on ? dialogo : null;
    Array.from(document.body.children).forEach(el => {
      if (el !== dialogo && el.id !== 'pix-veu' && el.tagName !== 'SCRIPT') el.inert = on;
    });
  }
  const focaveis = raiz => $$('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])', raiz)
    .filter(el => el.getClientRects().length > 0);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !dialogoAberto) return;
    const lista = focaveis(dialogoAberto);
    if (!lista.length) return;
    const primeiro = lista[0], ultimo = lista[lista.length - 1], atual = document.activeElement;
    if (!dialogoAberto.contains(atual)) { e.preventDefault(); primeiro.focus(); }
    else if (e.shiftKey && atual === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && atual === ultimo) { e.preventDefault(); primeiro.focus(); }
  });
  // Foco num elemento que não é de clicar (título, seção), para o leitor de tela anunciar onde se está
  function focarEm(el, rolar) {
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: !rolar });
  }

  // ---------- navegação suave por âncoras ----------
  function irPara(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = id === 'capa' ? 0 : el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: Math.max(0, top), behavior: reduzirMovimento ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id || !document.getElementById(id)) { if (a.getAttribute('href') === '#') e.preventDefault(); return; }
    e.preventDefault();
    fecharMenu(false);
    // rola até a seção e leva o foco para ela (senão o próximo Tab volta para o topo da página)
    requestAnimationFrame(() => { irPara(id); focarEm(document.getElementById(id), false); });
    history.replaceState(null, '', '#' + id);
  });

  // ---------- topo + menu ----------
  const topo = $('#topo');
  function atualizarTopo() { topo.classList.toggle('is-solido', window.scrollY > Math.max(120, window.innerHeight - 140)); }
  window.addEventListener('scroll', atualizarTopo, { passive: true });

  const menu = $('#menu'), btnMenu = $('#abrir-menu');
  function abrirMenu() {
    fecharTrilha();
    menu.hidden = false; btnMenu.setAttribute('aria-expanded', 'true'); travar('menu', true); isolar(menu, true);
    $('#fechar-menu').focus();
  }
  function fecharMenu(devolverFoco) {
    if (menu.hidden) return;
    menu.hidden = true; btnMenu.setAttribute('aria-expanded', 'false'); travar('menu', false); isolar(menu, false);
    if (devolverFoco !== false) btnMenu.focus();
  }
  btnMenu.addEventListener('click', abrirMenu);
  $('#fechar-menu').addEventListener('click', () => fecharMenu());

  // ---------- contagem regressiva ----------
  function atualizarContagem() {
    const agora = Date.now(), diff = ALVO - agora;
    const box = $('#contagem'), msg = $('#contagem-mensagem');
    if (diff > 0) {
      const min = Math.floor(diff / 60000);
      $('[data-cd="dias"]').textContent = String(Math.floor(min / 1440));
      $('[data-cd="horas"]').textContent = String(Math.floor((min % 1440) / 60)).padStart(2, '0');
      $('[data-cd="minutos"]').textContent = String(min % 60).padStart(2, '0');
      box.hidden = false; msg.hidden = true;
    } else {
      box.hidden = true; msg.hidden = false;
      msg.textContent = agora < FIM_DIA ? 'Hoje é o grande dia!' : 'Obrigado por celebrar com a gente';
    }
  }

  // ---------- revelar ao rolar (fade + 10px, uma vez) ----------
  function prepararRevelar() {
    if (reduzirMovimento || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
    const io = new IntersectionObserver(entradas => entradas.forEach(en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      en.target.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.2,.6,.2,1)' });
    }), { threshold: 0.01 });
    $$('[data-reveal]').forEach(el => { if (el.getBoundingClientRect().top >= window.innerHeight) io.observe(el); });
  }

  // ---------- WhatsApp dos noivos ----------
  function aplicarWhats() {
    const n = (siteConfig.whatsapp || '').replace(/\D/g, '');
    $$('[data-whats]').forEach(a => {
      a.href = n ? 'https://wa.me/' + n : '#';
      a.textContent = n ? 'WhatsApp dos noivos' : '[WhatsApp dos noivos]';
    });
  }

  // ---------- vídeo ----------
  function idYoutube(v) {
    v = (v || '').trim();
    const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(v) ? v : '');
  }
  function prepararVideo() {
    const id = idYoutube(siteConfig.youtubeId);
    $('#video-aviso').hidden = !!id;
    $('#tocar-video').addEventListener('click', () => {
      if (!id) return;
      const f = document.createElement('iframe');
      f.title = 'Vídeo do ensaio';
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      $('#video').replaceChildren(f);
    });
  }

  // ---------- trilha sonora ----------
  const trilha = $('#trilha'), btnMusica = $('#botao-musica');
  function prepararTrilha() {
    const m = (siteConfig.spotifyUrl || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/([A-Za-z0-9]+)/);
    if (m) {
      $('#trilha-player').innerHTML = '<iframe title="Playlist Nossa trilha" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" src="https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator"></iframe>';
    }
  }
  function fecharTrilha() { trilha.hidden = true; btnMusica.setAttribute('aria-expanded', 'false'); }
  btnMusica.addEventListener('click', () => { const abrir = trilha.hidden; trilha.hidden = !abrir; btnMusica.setAttribute('aria-expanded', String(abrir)); });
  $('#fechar-trilha').addEventListener('click', fecharTrilha);

  // ---------- RSVP ----------
  const rsvp = { etapa: 'busca', convite: null, escolhas: {}, carregando: false };
  const raizRsvp = $('#rsvp');

  // Onde o foco vai ao mudar de etapa (o botão clicado some; sem isso o foco caía no início da página)
  const FOCO_ETAPA = { encontrado: '.eyebrow', sucesso: '.rsvp__obrigado', respondido: '.rsvp__titulo', naoEncontrado: '.texto', encerrado: '.rsvp__titulo', busca: '#rsvp-nome' };
  function mostrarEtapa(etapa, focar) {
    rsvp.etapa = siteConfig.encerrado ? 'encerrado' : etapa;
    $$('[data-etapa]', raizRsvp).forEach(el => { el.hidden = el.dataset.etapa !== rsvp.etapa; });
    avisar('');
    if (focar) {
      const el = $(FOCO_ETAPA[rsvp.etapa], $('[data-etapa="' + rsvp.etapa + '"]', raizRsvp));
      if (el && el.matches('input')) el.focus(); else focarEm(el, true);
    }
  }
  function avisar(texto) {
    $$('[data-aviso]', raizRsvp).forEach(p => { p.textContent = texto; p.hidden = !texto; });
  }
  function carregando(on, btn, textoOn, textoOff) {
    rsvp.carregando = on; btn.disabled = on; btn.textContent = on ? textoOn : textoOff;
  }

  function renderPessoas() {
    const c = rsvp.convite;
    $('#rsvp-pessoas').innerHTML = c.convidados.map(p => {
      const v = rsvp.escolhas[p.id];
      // Grupo de rádio: um só Tab por pessoa (na opção marcada, ou em "Vou" se nada marcado); setas trocam
      const tab = s => (v ? v === s : s === 'vai') ? '0' : '-1';
      return '<div class="rsvp__pessoa">' +
        '<p class="rsvp__nome">' + esc(p.nome) + '</p>' +
        '<div class="opcoes" role="radiogroup" aria-label="' + esc(p.nome) + '">' +
          '<button type="button" class="opcao" role="radio" aria-checked="' + (v === 'vai') + '" tabindex="' + tab('vai') + '" data-pessoa="' + p.id + '" data-status="vai">Vou</button>' +
          '<button type="button" class="opcao" role="radio" aria-checked="' + (v === 'nao') + '" tabindex="' + tab('nao') + '" data-pessoa="' + p.id + '" data-status="nao">Não poderei ir</button>' +
        '</div></div>';
    }).join('');
  }
  function marcarOpcao(b) {
    rsvp.escolhas[b.dataset.pessoa] = b.dataset.status;
    avisar('');
    $$('.opcao[data-pessoa="' + b.dataset.pessoa + '"]').forEach(x => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
  }
  $('#rsvp-pessoas').addEventListener('click', e => {
    const b = e.target.closest('.opcao');
    if (b) marcarOpcao(b);
  });
  $('#rsvp-pessoas').addEventListener('keydown', e => {
    const b = e.target.closest('.opcao');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const outra = $$('.opcao[data-pessoa="' + b.dataset.pessoa + '"]').find(x => x !== b);
    marcarOpcao(outra); outra.focus();
  });

  function dataBR(iso) {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function renderRespondido() {
    const r = rsvp.convite.resposta;
    $('#rsvp-data-anterior').textContent = dataBR(r.data);
    $('#rsvp-anteriores').innerHTML = r.itens.map(i =>
      '<div><span class="nome">' + esc(i.nome) + '</span><span class="status">' + (i.status === 'vai' ? 'Vai' : 'Não poderá ir') + '</span></div>'
    ).join('');
  }
  function renderSucesso(resposta) {
    const vao = resposta.itens.filter(i => i.status === 'vai').map(i => i.nome);
    const nao = resposta.itens.filter(i => i.status === 'nao').map(i => i.nome);
    $('#resumo-vao').hidden = !vao.length; $('#resumo-vao .valor').textContent = vao.join(', ');
    $('#resumo-nao').hidden = !nao.length; $('#resumo-nao .valor').textContent = nao.join(', ');
  }

  $('#form-busca').addEventListener('submit', async e => {
    e.preventDefault();
    if (rsvp.carregando) return;
    const btn = $('#btn-buscar'), nome = $('#rsvp-nome').value;
    carregando(true, btn, 'Buscando…', 'Buscar convite'); avisar('');
    try {
      const res = await api('/api/convites/busca?nome=' + encodeURIComponent(nome));
      if (res.tipo === 'curto') return avisar('Digite nome e sobrenome, como está no convite.');
      if (res.tipo === 'ambiguo') return avisar('Encontramos mais de um convite com esse nome. Digite seu nome completo, como está no convite.');
      if (res.tipo === 'nao') return mostrarEtapa('naoEncontrado', true);
      rsvp.convite = res.convite; rsvp.escolhas = {};
      if (res.convite.resposta) { renderRespondido(); mostrarEtapa('respondido', true); }
      else { renderPessoas(); mostrarEtapa('encontrado', true); }
    } catch (err) {
      if (err.status === 403) { siteConfig.encerrado = true; return mostrarEtapa('encerrado', true); }
      avisar(err.status === 429 ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' : 'Não conseguimos buscar agora. Confira sua internet e tente de novo.');
    } finally { carregando(false, btn, 'Buscando…', 'Buscar convite'); }
  });

  $('#btn-confirmar').addEventListener('click', async () => {
    const c = rsvp.convite, btn = $('#btn-confirmar');
    if (!c || rsvp.carregando) return;
    if (c.convidados.some(p => !rsvp.escolhas[p.id])) return avisar('Marque uma opção para cada nome.');
    carregando(true, btn, 'Enviando…', 'Confirmar presença');
    try {
      const itens = c.convidados.map(p => ({ id: p.id, status: rsvp.escolhas[p.id] }));
      const resposta = await api('/api/convites/' + encodeURIComponent(c.codigo) + '/resposta', { method: 'POST', body: { itens } });
      c.resposta = resposta;
      renderSucesso(resposta); mostrarEtapa('sucesso', true);
    } catch (err) {
      if (err.status === 403) { siteConfig.encerrado = true; return mostrarEtapa('encerrado', true); }
      avisar('Não conseguimos enviar sua resposta. Tente de novo em instantes.');
    } finally { carregando(false, btn, 'Enviando…', 'Confirmar presença'); }
  });

  raizRsvp.addEventListener('click', e => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'recomecar') { rsvp.convite = null; rsvp.escolhas = {}; $('#rsvp-nome').value = ''; mostrarEtapa('busca', true); }
    if (b.dataset.acao === 'tentar') { mostrarEtapa('busca', true); }
    if (b.dataset.acao === 'alterar') {
      rsvp.escolhas = {};
      (rsvp.convite.resposta ? rsvp.convite.resposta.itens : []).forEach(i => { rsvp.escolhas[i.id] = i.status; });
      renderPessoas(); mostrarEtapa('encontrado', true);
    }
  });

  // ---------- lista de presentes ----------
  // Cada presente: comprar (reserva 1 unidade) ou dar o valor por Pix.
  // quantidade 0 = presente só por Pix (ex.: experiências da lua de mel).
  let presenteAtual = null, focoAntesPix = null, tCopia = null, pixCarregado = false;
  const raizPix = document.body;

  function cartaoPresente(g) {
    const esgotado = g.quantidade > 0 && g.disponiveis <= 0;
    const restam = g.quantidade > 1 && g.disponiveis > 0 ? '<p class="presente__restam">' + (g.disponiveis === 1 ? 'Resta 1' : 'Restam ' + g.disponiveis) + '</p>' : '';
    return '<article class="presente" data-reveal data-presente="' + g.id + '">' +
      '<div class="presente__foto">' + (fotoSegura(g.imagem) ? '<img src="' + esc(fotoSegura(g.imagem)) + '" alt="" loading="lazy">' : '<span>[foto do presente]</span>') + '</div>' +
      '<div class="presente__info">' +
        '<h3 class="presente__nome">' + esc(g.nome) + '</h3>' +
        '<p class="presente__valor">' + reais(g.valor) + '</p>' + restam +
        '<div class="espaco"></div>' +
        (esgotado
          ? '<button type="button" class="btn btn--esgotado btn--bloco" disabled>Já escolhido</button>'
          : '<button type="button" class="btn btn--primario btn--bloco" data-presentear="' + g.id + '">Presentear</button>') +
      '</div>' +
    '</article>';
  }

  async function carregarPresentes() {
    const grade = $('#lista-presentes');
    try {
      const lista = await api('/api/presentes');
      grade._presentes = lista;
      grade.innerHTML = lista.length ? lista.map(cartaoPresente).join('') : '<p class="texto presentes__vazio">Em breve, as opções de presente estarão aqui.</p>';
    } catch (err) {
      grade.innerHTML = '<p class="texto presentes__vazio">Não conseguimos carregar a lista agora. Recarregue a página para tentar de novo.</p>';
    } finally { grade.removeAttribute('aria-busy'); }
  }
  $('#lista-presentes').addEventListener('click', e => {
    const b = e.target.closest('[data-presentear]');
    if (!b) return;
    const g = ($('#lista-presentes')._presentes || []).find(x => String(x.id) === b.dataset.presentear);
    if (g) abrirPresente(g, b);
  });

  function passo(nome) {
    $$('[data-passo]', $('#pix')).forEach(el => { el.hidden = el.dataset.passo !== nome; });
    const foco = { modo: '.modo', comprar: '#comprar-nome', pix: '#copiar-pix', reservado: '#fechar-pix' }[nome];
    const el = $(foco, $('#pix'));
    if (el) el.focus({ preventScroll: true });
    $('#pix').scrollTop = 0;
  }
  function avisoEm(form, t) { const p = $('[data-aviso]', form); p.textContent = t; p.hidden = !t; }

  function abrirPresente(g, origem) {
    presenteAtual = g; focoAntesPix = origem; pixCarregado = false;
    fecharTrilha();
    $('#pix-nome').textContent = g.nome;
    $('#pix-valor').textContent = reais(g.valor);
    $('#modo-comprar').hidden = !(g.quantidade > 0);
    ['#form-comprar', '#form-recado'].forEach(s => { $(s).reset(); avisoEm($(s), ''); });
    $('#btn-reservar').disabled = false; $('#btn-reservar').textContent = 'Reservar presente';
    $('#enviar-recado').disabled = false; $('#enviar-recado').textContent = 'Avisar os noivos';
    $('#voltar-pix').hidden = !(g.quantidade > 0);
    raizPix.classList.add('pix-aberto'); $('#pix').setAttribute('aria-hidden', 'false'); travar('pix', true); isolar($('#pix'), true);
    // Presente só por Pix pula a pergunta
    if (g.quantidade > 0) passo('modo'); else mostrarPix();
  }

  async function mostrarPix() {
    passo('pix');
    $('#pix-titulo').textContent = 'Presentear com Pix';
    if (pixCarregado) return;
    $('#pix-qr').textContent = 'Gerando QR Code…'; $('#pix-codigo').value = ''; $('#copiar-pix').textContent = 'Copiar código';
    try {
      const p = await api('/api/presentes/' + presenteAtual.id + '/pix');
      const qr = document.createElement('img');
      qr.src = /^data:image\/png;base64,/.test(p.qr) ? p.qr : '';
      qr.alt = 'QR Code do Pix de ' + presenteAtual.nome;
      $('#pix-qr').replaceChildren(qr);
      $('#pix-codigo').value = p.payload;
      $('#pix-recebedor').textContent = p.recebedor;
      pixCarregado = true;
    } catch (err) { $('#pix-qr').textContent = 'Não foi possível gerar o QR Code.'; }
  }

  $('#pix').addEventListener('click', e => {
    const m = e.target.closest('[data-modo]');
    if (m) {
      if (m.dataset.modo === 'pix') mostrarPix();
      else { $('#pix-titulo').textContent = 'Vou comprar o presente'; passo('comprar'); }
    }
    if (e.target.closest('[data-voltar]')) { $('#pix-titulo').textContent = 'Presentear'; passo('modo'); }
  });

  function fecharPix() {
    if (!raizPix.classList.contains('pix-aberto')) return;
    raizPix.classList.remove('pix-aberto'); $('#pix').setAttribute('aria-hidden', 'true'); travar('pix', false); isolar($('#pix'), false);
    $('#pix-titulo').textContent = 'Presentear';
    // Volta para o botão que abriu. Se a lista foi redesenhada (ex.: depois de reservar), volta para o
    // mesmo presente: o botão "Presentear" ou, se esgotou, o nome dele.
    let volta = focoAntesPix && document.contains(focoAntesPix) ? focoAntesPix : null;
    if (!volta && presenteAtual) {
      const cartao = $('[data-presente="' + presenteAtual.id + '"]', $('#lista-presentes'));
      volta = cartao && ($('[data-presentear]', cartao) || $('.presente__nome', cartao));
    }
    if (volta) { if (volta.matches('button')) volta.focus({ preventScroll: true }); else focarEm(volta, false); }
  }
  $('#fechar-pix').addEventListener('click', fecharPix);
  $('#pix-veu').addEventListener('click', fecharPix);

  $('#copiar-pix').addEventListener('click', () => {
    const codigo = $('#pix-codigo').value;
    if (!codigo) return;
    const ok = () => { $('#copiar-pix').textContent = 'Código copiado!'; clearTimeout(tCopia); tCopia = setTimeout(() => { $('#copiar-pix').textContent = 'Copiar código'; }, 2500); };
    const manual = () => { $('#pix-codigo').select(); document.execCommand('copy'); ok(); };
    if (navigator.clipboard) navigator.clipboard.writeText(codigo).then(ok, manual); else manual();
  });

  // Comprar → reserva
  $('#form-comprar').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, nome = f.nome.value.trim();
    if (nome.length < 2) return avisoEm(f, 'Digite seu nome para reservarmos o presente.');
    const btn = $('#btn-reservar'); btn.disabled = true; btn.textContent = 'Reservando…'; avisoEm(f, '');
    try {
      const r = await api('/api/presentes/' + presenteAtual.id + '/escolhas', { method: 'POST', body: { modo: 'comprar', nome, mensagem: f.mensagem.value.trim() } });
      const loja = linkSeguro(r.linkLoja);
      $('#reservado-loja').hidden = !loja; if (loja) $('#link-loja').href = loja;
      $('#reservado-entrega').hidden = !r.entrega; $('#endereco-entrega').textContent = r.entrega || '';
      passo('reservado');
      carregarPresentes();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Reservar presente';
      if (err.status === 409) { avisoEm(f, 'Alguém acabou de escolher este presente para comprar. Você ainda pode dar o valor por Pix ou escolher outro.'); carregarPresentes(); }
      else avisoEm(f, 'Não conseguimos reservar agora. Tente de novo em instantes.');
    }
  });

  // Pix → avisar os noivos
  $('#form-recado').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, nome = f.nome.value.trim();
    if (nome.length < 2) return avisoEm(f, 'Digite seu nome para os noivos saberem quem presenteou.');
    const btn = $('#enviar-recado'); btn.disabled = true; btn.textContent = 'Enviando…'; avisoEm(f, '');
    try {
      await api('/api/presentes/' + presenteAtual.id + '/escolhas', { method: 'POST', body: { modo: 'pix', nome, mensagem: f.mensagem.value.trim() } });
      btn.textContent = 'Recado enviado. Obrigado!';
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Avisar os noivos';
      avisoEm(f, 'Não conseguimos enviar agora. Tente de novo em instantes.');
    }
  });

  // ---------- dicas da região ----------
  function renderDicas() {
    const guias = window.DICAS || [];
    $('#atalhos-dicas').innerHTML = guias.map(g => '<a href="#' + g.id + '">' + esc(g.titulo) + '</a>').join('');
    $('#guias').innerHTML = guias.map(g =>
      '<div class="guia" id="' + g.id + '">' +
        '<div class="guia__cabeca" data-reveal><h3>' + esc(g.titulo) + '</h3>' + (g.nota ? '<p class="guia__nota">' + esc(g.nota) + '</p>' : '') + '</div>' +
        '<div class="guia__lista">' + g.itens.map(lugarHtml).join('') + '</div>' +
      '</div>'
    ).join('');
  }
  function lugarHtml(it) {
    const [nome, tipo, local, tel, ig, logo] = it;
    const d = tel ? tel.replace(/\D/g, '') : '';
    let contatos = '';
    if (tel) contatos += '<a href="tel:+55' + d + '">' + esc(tel) + '</a>';
    if (d.length === 11) contatos += '<a href="https://wa.me/55' + d + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (ig) contatos += '<a href="https://instagram.com/' + esc(ig) + '" target="_blank" rel="noopener" style="word-break:break-all;white-space:normal">@' + esc(ig) + '</a>';
    return '<div class="lugar" data-reveal>' +
      '<img src="assets/logos/' + logo + '.jpg" alt="' + esc(nome) + '" loading="lazy">' +
      '<div style="min-width:0"><p class="lugar__nome">' + esc(nome) + '</p>' +
      '<p class="lugar__tipo">' + esc(tipo) + ' · ' + esc(local) + '</p>' +
      '<div class="lugar__contatos">' + contatos + '</div></div></div>';
  }

  // ---------- teclado ----------
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    fecharPix(); fecharMenu(); fecharTrilha();
  });

  // ---------- início ----------
  async function iniciar() {
    renderDicas();
    atualizarTopo();
    atualizarContagem();
    setInterval(atualizarContagem, 15000);
    try { Object.assign(siteConfig, await api('/api/config')); } catch (e) { /* sem backend: segue com o padrão */ }
    $$('[data-prazo-texto]').forEach(s => { s.textContent = siteConfig.prazoTexto; });
    aplicarWhats();
    prepararVideo();
    prepararTrilha();
    mostrarEtapa('busca');
    await carregarPresentes();
    setTimeout(prepararRevelar, 80);
    if (location.hash.length > 1) setTimeout(() => irPara(location.hash.slice(1)), 120);
  }
  iniciar();
})();
