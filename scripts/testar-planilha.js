// Teste de ligação com o Apps Script já implantado (não grava nada; não mostra dados pessoais).
// Uso no PowerShell:
//   $env:APPS_SCRIPT_URL = 'https://script.google.com/macros/s/…/exec'
//   $env:APPS_SCRIPT_SEGREDO = '…'   (menu Casamento → Mostrar segredo da API)
//   npm.cmd run testar-planilha
const { chamarPlanilha } = require('../lib/planilha/cliente');

(async () => {
  const url = process.env.APPS_SCRIPT_URL;
  const segredo = process.env.APPS_SCRIPT_SEGREDO;
  if (!url || !segredo) {
    console.error('Defina APPS_SCRIPT_URL e APPS_SCRIPT_SEGREDO antes (veja apps-script/LEIA-ME.md).');
    process.exit(1);
  }
  const inicio = Date.now();
  try {
    // a primeira chamada pode demorar alguns segundos (o Google "acorda" o script)
    const s = await chamarPlanilha('saude', {}, { url, segredo, tempoLimiteMs: 30000 });
    console.log(`✔ Ligação OK em ${Date.now() - inicio} ms — versão ${s.versao}: ${s.convidados} convidados e ${s.presentes} presentes visíveis para o site.`);
  } catch (e) {
    console.error(`✖ Falhou (${e.codigo}): ${e.message}`);
    if (e.codigo === 'nao_autorizado') console.error('  O segredo não confere com o do menu "Mostrar segredo da API".');
    if (e.codigo === 'indisponivel') console.error('  Confira a URL (termina em /exec) e se a implantação está com acesso "Qualquer pessoa".');
    process.exit(1);
  }
  try {
    await chamarPlanilha('saude', {}, { url, segredo: segredo + 'errado', tempoLimiteMs: 30000 });
    console.error('✖ ATENÇÃO: o script aceitou um segredo errado!');
    process.exit(2);
  } catch (e) {
    if (e.codigo !== 'nao_autorizado') throw e;
    console.log('✔ Um segredo errado é recusado.');
  }
})();
