// Leitura e validação do .env.
// Um valor errado impede o servidor de subir (melhor falhar no deploy do que no dia do convite).
const express = require('express');
const { normalizarChave, payloadPix, textoPix } = require('./pix');

/** Dados do recebedor do Pix vindos do .env (com os padrões do casamento). */
const dadosPix = (env = process.env) => ({
  chave: env.PIX_CHAVE,
  nome: env.PIX_NOME || 'Millena e Leonardo',
  cidade: env.PIX_CIDADE || 'Jaguaquara'
});

const PRAZO_PADRAO = '2027-05-03T23:59:59-03:00';
// Data e hora com fuso obrigatório: 2027-05-03T23:59:59-03:00
const FORMATO_PRAZO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;

/** Prazo do RSVP como Date. Lança erro se o texto não estiver no formato ISO com fuso. */
function lerPrazo(texto) {
  const t = String(texto || PRAZO_PADRAO).trim();
  const d = new Date(t);
  if (!FORMATO_PRAZO.test(t) || isNaN(d)) {
    throw new Error(`RSVP_PRAZO="${t}" inválido. Use data, hora e fuso, ex.: ${PRAZO_PADRAO}`);
  }
  return d;
}
const prazoRsvp = () => lerPrazo(process.env.RSVP_PRAZO);

/**
 * TRUST_PROXY → valor para app.set('trust proxy').
 *  vazio/0/false → false (acesso direto, sem proxy)
 *  número        → quantos proxies existem na frente (Render, Railway, Fly: 1)
 *  lista         → IPs/faixas/nomes aceitos pelo Express (ex.: loopback, 10.0.0.0/8)
 * "true" é recusado: confiaria em qualquer X-Forwarded-For e qualquer um burlaria o limite por IP.
 */
function trustProxy(bruto) {
  const v = String(bruto == null ? '' : bruto).trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') throw new Error('TRUST_PROXY=true confia em qualquer cabeçalho X-Forwarded-For e anula o limite de tentativas. Use o número de proxies na frente do site (normalmente 1).');
  try { express().set('trust proxy', bruto); } catch (e) {
    throw new Error(`TRUST_PROXY="${bruto}" inválido. Use o número de proxies (ex.: 1) ou uma lista de IPs.`);
  }
  return String(bruto).trim();
}

/** Valida o .env inteiro. Devolve { erros, avisos, info } — erros impedem o servidor de subir. */
function validar(env = process.env) {
  const erros = [], avisos = [], info = [];
  const tentar = fn => { try { return fn(); } catch (e) { erros.push(e.message); } };

  tentar(() => trustProxy(env.TRUST_PROXY));
  const prazo = tentar(() => lerPrazo(env.RSVP_PRAZO));
  if (prazo) info.push('Prazo do RSVP: ' + prazo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' }) + ' (horário de Brasília)');

  if (env.PIX_CHAVE) {
    const k = tentar(() => normalizarChave(env.PIX_CHAVE));
    if (k) {
      info.push(`Chave Pix reconhecida como ${k.tipo}: ${k.chave}`);
      const d = dadosPix(env);
      if (tentar(() => payloadPix(Object.assign({ valorCentavos: 100 }, d)))) {
        info.push(`No QR do Pix: recebedor "${textoPix(d.nome, 25)}", cidade "${textoPix(d.cidade, 15)}"`);
      }
    }
  } else avisos.push('PIX_CHAVE não definida — o Pix da lista de presentes vai falhar até configurar o .env.');

  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16) avisos.push('ADMIN_TOKEN ausente ou com menos de 16 caracteres — painel desativado.');
  if (env.NODE_ENV === 'production' && trustProxy.seguro(env.TRUST_PROXY) === false) {
    avisos.push('TRUST_PROXY não definido. Se o site estiver atrás de um proxy (Render, Railway, Fly, Nginx), defina TRUST_PROXY=1; senão todos os convidados contam como o mesmo IP e o limite de tentativas bloqueia todo mundo junto.');
  }
  return { erros, avisos, info };
}
trustProxy.seguro = v => { try { return trustProxy(v); } catch (e) { return null; } };

module.exports = { validar, lerPrazo, prazoRsvp, trustProxy, dadosPix, PRAZO_PADRAO };
