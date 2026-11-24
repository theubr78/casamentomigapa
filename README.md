# Site de casamento · Millena & Leonardo (03.07.2027)

Código do site, convertido do design (Claude Design), com um backend simples para a **confirmação de presença**, o **controle de convidados** e a **lista de presentes**.

```
site-casamento/
├── frontend/                 site estático (HTML + CSS + JS puro, sem build)
│   ├── index.html            todas as seções do design
│   ├── css/styles.css        tokens de cor/fonte no :root + componentes
│   ├── css/fontes.css        @font-face das fontes servidas pelo site (pasta fonts/, licença OFL)
│   ├── js/config.js          apiBase e data do casamento
│   ├── js/dados.js           "Dicas da região" (hotéis, restaurantes, beleza)
│   ├── js/app.js             menu, contagem, RSVP, presentes/Pix, trilha, vídeo
│   ├── admin/                painel dos noivos (/admin)
│   └── assets/               fotos já otimizadas (webp/jpg), monogramas, logos
├── backend/                  Node + Express + SQLite (um arquivo .db)
│   ├── src/server.js         valida o .env e sobe o servidor
│   ├── src/app.js            monta o Express: API em /api, site estático, erros
│   ├── src/config.js         leitura e validação do .env (prazo, TRUST_PROXY, Pix)
│   ├── src/db.js             banco e migrações numeradas (PRAGMA user_version)
│   ├── src/convidados.js     busca por nome, resposta, importar/exportar CSV
│   ├── src/pix.js            gera o Pix copia e cola + QR com o valor
│   ├── src/entrada.js        validação das entradas da API
│   ├── src/seguranca.js      cabeçalhos HTTP (CSP etc.)
│   ├── src/routes/publico.js rotas do site
│   ├── src/routes/admin.js   rotas do painel (token)
│   ├── test/                 testes (node:test + supertest): npm test
│   ├── scripts/              importar CSV, dados de exemplo
│   └── .env.example
└── design-original/          o .dc.html do design e os monogramas em alta, só para referência
```

## Rodar localmente

```bash
cd backend
npm install
cp .env.example .env        # preencha ADMIN_TOKEN e PIX_CHAVE
npm run exemplo             # opcional: convites e presentes de teste
npm run dev                 # http://localhost:3000  e  /admin
npm test                    # testes da API (banco em memória; não mexe no seu .db nem no .env)
```

Requer Node 22 ou 24 (recomendado 24: o 22 sai de suporte em abril de 2027). Ao subir, o servidor confere o `.env`: um prazo, uma chave Pix ou um `TRUST_PROXY` inválido impedem a inicialização, com a explicação no terminal. Teste de busca com os dados de exemplo: “Ana Souza”, “Carla Mendes” (já respondeu), “João Santos” (dá ambíguo).

## Variáveis do `.env`

| Variável | Para quê |
|---|---|
| `ADMIN_TOKEN` | Senha do painel `/admin` (16+ caracteres; `openssl rand -hex 24`) |
| `RSVP_PRAZO` | Depois deste instante o formulário fecha. Data, hora **e fuso**: `2027-05-03T23:59:59-03:00` |
| `WHATSAPP_NOIVOS` | Número com DDI, só dígitos (`5573…`) |
| `SPOTIFY_URL` / `YOUTUBE_ID` | Playlist da “Nossa trilha” e vídeo do ensaio (link ou ID) |
| `PIX_CHAVE`, `PIX_NOME`, `PIX_CIDADE`, `PIX_BANCO` | Dados do Pix. Chave: CPF/CNPJ, e-mail, telefone **com +55** ou aleatória. Nome até 25 e cidade até 15 caracteres (sem acento no QR) |
| `ENDERECO_ENTREGA` | Mostrado só a quem escolhe “Vou comprar” |
| `CORS_ORIGIN` | Só se o frontend ficar em outro domínio |
| `TRUST_PROXY` | Quantos proxies há na frente do site: `1` no Render, Railway, Fly ou atrás de Nginx; vazio se o acesso for direto. Errar para menos bloqueia todos os convidados juntos; para mais, deixa burlar o limite. `true` é recusado |

## Como funciona

**Confirmação de presença** — o convidado digita nome e sobrenome. A API devolve **só o convite encontrado** (a lista inteira nunca vai para o navegador), com limite de tentativas por IP. Mesma regra do design: nome exato sem acento; senão, primeiro nome + todas as palavras digitadas. Mais de um convite → pede o nome completo. Cada pessoa do convite marca “Vou” ou “Não poderei ir”; dá para alterar até o prazo. Toda resposta fica em `historico_respostas`.

**Lista de presentes** — o convidado toca em **Presentear** e escolhe:
- **Vou comprar o presente** → informa o nome, o presente fica **reservado** (cada presente tem uma `quantidade`; esgotou → “Já escolhido”) e ele vê o link da loja e o endereço de entrega.
- **Prefiro dar o valor por Pix** → QR Code e copia e cola gerados com o **valor do presente** a partir da chave Pix do `.env`; depois ele pode tocar em “Avisar os noivos” com nome e recado.
- `quantidade = 0` → presente só por Pix (experiências, lua de mel).

**Painel `/admin`** — números gerais; convites com status por pessoa (dá para marcar quem confirmou pelo WhatsApp), adicionar/remover, importar e exportar CSV (abre no Excel); presentes (valor, quantidade, foto, link da loja, ativo); escolhas dos convidados com “conferido” (Pix caiu / presente chegou) e excluir (libera a reserva).

### Importar convidados

CSV com duas colunas, vírgula ou ponto e vírgula, cabeçalho opcional. O mesmo valor em `convite` junta as pessoas no mesmo convite:

```csv
convite,nome
Família Souza,Ana Beatriz Souza
Família Souza,Pedro Henrique Souza
João Lima,João Santos Lima
```

Pelo painel (botão **Importar CSV**) ou `npm run importar -- convidados.csv`. Reimportar não duplica nomes.

## API

Públicas: `GET /api/config` · `GET /api/convites/busca?nome=` · `POST /api/convites/:codigo/resposta` `{itens:[{id,status:'vai'|'nao'}]}` · `GET /api/presentes` · `GET /api/presentes/:id/pix` · `POST /api/presentes/:id/escolhas` `{modo:'comprar'|'pix', nome, mensagem?}` (409 se esgotou).

Admin (`Authorization: Bearer <ADMIN_TOKEN>`): `GET /resumo` · `GET|POST /convites` · `PATCH|DELETE /convites/:id` · `POST /convites/:id/convidados` · `PATCH|DELETE /convidados/:id` · `GET /convites/:id/historico` · `POST /importar` (text/csv) · `GET /exportar.csv` · `GET|POST /presentes` · `PATCH|DELETE /presentes/:id` · `GET /escolhas` · `PATCH|DELETE /escolhas/:id` — todas sob `/api/admin`.

## Banco de dados: como mudar a estrutura

As tabelas são criadas e atualizadas por **migrações numeradas** em `backend/src/db.js` (a versão fica em `PRAGMA user_version`). Ao subir, o servidor aplica só as que faltam, cada uma numa transação. Para mudar a estrutura, **acrescente** um item no fim da lista `migracoes` (nunca edite nem apague um item já publicado) e um teste em `test/db.test.js`. Faça backup do `.db` antes de publicar uma migração.

## Publicar

O jeito mais simples é **um serviço Node só** (Render, Railway, Fly.io, VPS): ele serve o site e a API juntos. Use um **disco persistente** para `backend/data/` (onde fica o `.db`) e faça backup desse arquivo de vez em quando (ou exporte o CSV).

Para hospedar o frontend separado (Netlify, Vercel), preencha `apiBase` em `frontend/js/config.js` e `CORS_ORIGIN` no backend.

## Pendências do conteúdo (marcadas como [ ] no site)

- WhatsApp dos noivos, playlist do Spotify e link do vídeo do ensaio → `.env`
- Fotos, valores e links dos presentes → painel
- Chave Pix e endereço de entrega → `.env`

## Diferenças em relação ao design

- O “ou pagar com cartão” virou o fluxo **comprar / Pix** (o texto da seção foi ajustado).
- O mosaico de fotos e o ampliador que existiam no código do design não estavam na página; não foram incluídos (as fotos `foto-5679/5680/5683/5686/5688/5693` e `foto-maos.jpg` estão em `assets/` se quiserem uma galeria).
- Estilos inline viraram classes em `styles.css`; cores e fontes são variáveis no `:root`.
- As fontes (as mesmas do Google Fonts) são servidas pelo próprio site, em `frontend/fonts/`; os monogramas foram reduzidos para 135×180 (os originais estão em `design-original/assets/`).
