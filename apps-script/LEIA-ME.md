# Apps Script do site do casamento — instalação

O script fica **só na planilha de CONVIDADOS** e acessa também a de PRESENTES.
Instale primeiro nas cópias **TESTE**; nas planilhas reais, só no fim.

## 1. Colar o código (uma vez)

1. Abra a planilha **TESTE – Convidados** → **Extensões → Apps Script**.
2. Dê o nome **Site do casamento** ao projeto (clique em "Projeto sem título").
3. Clique na engrenagem (**Configurações do projeto**) e marque
   **"Mostrar arquivo de manifesto 'appsscript.json' no editor"**.
4. Volte ao editor (ícone `< >`). Para cada arquivo desta pasta:
   - `appsscript.json`: abra o que já existe e **substitua todo o conteúdo**;
   - `Config.gs`, `Util.gs`, `Tabela.gs`, `Api.gs`, `Acoes.gs`, `Menu.gs`: clique em **+ → Script**,
     digite o nome **sem** o `.gs` (ex.: `Config`) e cole o conteúdo inteiro do arquivo;
   - apague o `Código.gs` (ou `Code.gs`) que vem vazio.
5. **Ctrl+S** para salvar.

## 2. Configurar e preparar

1. Volte para a planilha e recarregue a página (**F5**). Em alguns segundos aparece o menu **Casamento**.
2. **Casamento → 1. Configurar**. Na primeira vez o Google pede autorização:
   **Continuar → sua conta → "O Google não verificou este app" → Avançado → Acessar Site do casamento → Permitir**.
   É normal: o "app" é o seu próprio script. Ele pede acesso a:
   - **planilhas** — ler e gravar convidados e presentes;
   - **Drive** — criar os backups (cópias das planilhas na pasta "Backups – Casamento");
   - **e-mail** — avisar você se algo der errado (no máximo um e-mail por hora);
   - **gatilhos** — o backup diário.
3. Cole o link da planilha **TESTE – Presentes**.
4. **Casamento → 2. Preparar planilhas → Sim**. Ele faz um backup e ajusta a estrutura:
   - Convidados: colunas **Outros nomes, Convite, Respondido em, Origem, ID**; o resumo que ficava
     embaixo da lista vai para a aba **Resumo**; aba **Respostas** (histórico).
   - Presentes: colunas **Mostrar no site, ID**; a linha "TOTAL DA LISTA" sai (o total está no Resumo);
     **Status** passa a ser calculado; aba **Escolhas** (cada reserva e cada aviso de Pix).
5. Confira: a coluna **Status** dos presentes deve mostrar "Disponível". Se aparecer `#ERROR!`, avise.
6. **Casamento → Conferir nomes dos convidados** lista quem pode não conseguir se achar no site.

## 3. Publicar a API (App da Web)

1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Engrenagem ao lado de "Selecionar tipo" → **App da Web**.
3. Descrição: `v1` · **Executar como: Eu** · **Quem pode acessar: Qualquer pessoa** → **Implantar**.
   ("Qualquer pessoa" é necessário para o Netlify chamar o script. Sem o segredo, nada é aceito.)
4. Copie a **URL do app da Web** (termina em `/exec`).

## 4. Testar a ligação (no seu computador)

No terminal do VS Code, na pasta do projeto:

```powershell
$env:APPS_SCRIPT_URL = 'cole-a-url-que-termina-em-/exec'
$env:APPS_SCRIPT_SEGREDO = 'cole-o-segredo'   # menu Casamento → Mostrar segredo da API
npm.cmd run testar-planilha
```

Esperado: `✔ Ligação OK …` e `✔ Um segredo errado é recusado.`

## Para atualizar o código depois

Cole o arquivo novo, **Ctrl+S**, e então **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**.
**Nunca** crie uma "Nova implantação" de novo: a URL mudaria e o site pararia.

## Regras para quem mexe na planilha

- **Pode:** acrescentar convidados e presentes (o ID aparece sozinho), mudar Presença à mão
  (confirmação por WhatsApp), marcar **Conferido** e **Cancelado** na aba Escolhas, esconder um presente
  com **Mostrar no site = Não**, reordenar e ordenar linhas.
- **Não pode:** renomear os cabeçalhos, apagar as colunas ID, digitar na coluna Status,
  apagar linhas da aba Escolhas (para liberar um presente, marque **Cancelado**),
  escrever qualquer coisa embaixo da lista de convidados na coluna Nome.
