const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { request, app, TOKEN, ip } = require('./ajuda');

const resumo = (token, ipFixo) => {
  const r = request(app).get('/api/admin/resumo').set('X-Forwarded-For', ipFixo || ip());
  return token == null ? r : r.set('Authorization', 'Bearer ' + token);
};

describe('autenticação do painel', () => {
  test('sem token → 401', async () => {
    assert.equal((await resumo(null).expect(401)).body.erro, 'nao_autorizado');
  });
  test('token errado (inclusive do mesmo tamanho) → 401', async () => {
    await resumo('errado').expect(401);
    await resumo('x'.repeat(TOKEN.length)).expect(401);
    await resumo(TOKEN + 'x').expect(401);
    await resumo(TOKEN.slice(0, -1)).expect(401);
  });
  test('token certo → 200', async () => {
    const r = await resumo(TOKEN).expect(200);
    assert.equal(typeof r.body.convidados, 'number');
  });
  test('ADMIN_TOKEN ausente ou curto → painel desativado (503)', async () => {
    const antes = process.env.ADMIN_TOKEN;
    try {
      process.env.ADMIN_TOKEN = 'curto';
      const r = await resumo('curto').expect(503);
      assert.match(r.body.mensagem, /ADMIN_TOKEN/);
    } finally { process.env.ADMIN_TOKEN = antes; }
  });
  test('10 senhas erradas bloqueiam o IP por 15 min (as certas não contam)', async () => {
    const meuIp = '198.51.100.20';
    for (let i = 0; i < 5; i++) await resumo(TOKEN, meuIp).expect(200);
    for (let i = 0; i < 10; i++) await resumo('errado' + i, meuIp).expect(401);
    const r = await resumo(TOKEN, meuIp).expect(429);
    assert.equal(r.body.erro, 'muitas_tentativas');
    await resumo(TOKEN, '198.51.100.21').expect(200); // outro IP segue normal
  });
});

describe('cabeçalhos HTTP', () => {
  for (const url of ['/', '/admin/', '/api/config']) {
    test('presentes em ' + url, async () => {
      const r = await request(app).get(url).expect(200);
      const csp = r.headers['content-security-policy'];
      assert.match(csp, /script-src 'self'(;|$)/, 'sem scripts de fora nem inline');
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(r.headers['x-content-type-options'], 'nosniff');
      assert.equal(r.headers['x-frame-options'], 'DENY');
      assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.equal(r.headers['x-powered-by'], undefined);
    });
  }
  test('HSTS só em produção', async () => {
    assert.equal((await request(app).get('/api/config')).headers['strict-transport-security'], undefined);
  });
  test('API nunca é guardada em cache', async () => {
    assert.equal((await request(app).get('/api/config')).headers['cache-control'], 'no-store');
  });
});
