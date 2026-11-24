/**
 * Site do casamento Millena & Leonardo — configuração do Apps Script.
 *
 * Este projeto fica instalado na planilha de CONVIDADOS e acessa também a de PRESENTES.
 * As colunas são encontradas pelo TEXTO do cabeçalho: a ordem e a letra da coluna não importam,
 * mas o texto precisa ser exatamente o daqui (maiúsculas e acentos não importam).
 */
var VERSAO = '1.0.0';

var ABAS = {
  CONVIDADOS: 'Lista de Convidados',
  RESPOSTAS: 'Respostas',
  RESUMO_CONVIDADOS: 'Resumo',
  PRESENTES: 'Lista de Presentes',
  ESCOLHAS: 'Escolhas',
  RESUMO_PRESENTES: 'Resumo'
};

var COLUNAS = {
  CONVIDADOS: {
    id: 'ID', nome: 'Nome', outros: 'Outros nomes', convite: 'Convite',
    presenca: 'Presença', respondidoEm: 'Respondido em', origem: 'Origem'
  },
  PRESENTES: {
    id: 'ID', categoria: 'Categoria', nome: 'Presente', tipo: 'Tipo', valor: 'Valor (R$)',
    prioridade: 'Prioridade', qtd: 'Qtd desejada', total: 'Total (R$)', status: 'Status',
    obs: 'Observações', link: 'Fotos e lojas', mostrar: 'Mostrar no site'
  },
  // Abas criadas pelo menu "Preparar planilhas", nesta ordem
  ESCOLHAS: {
    data: 'Data', pedido: 'Pedido', presenteId: 'ID presente', presente: 'Presente', categoria: 'Categoria',
    valor: 'Valor (R$)', modo: 'Como', nomeDigitado: 'Nome digitado', convidadoId: 'ID convidado',
    convidado: 'Convidado', recado: 'Recado', conferido: 'Conferido', cancelado: 'Cancelado'
  },
  RESPOSTAS: {
    data: 'Data', pedido: 'Pedido', convidadoId: 'ID convidado', nome: 'Nome', presenca: 'Presença', convite: 'Convite'
  }
};

// Colunas que o site precisa para funcionar (as outras são opcionais)
var OBRIGATORIAS = {
  CONVIDADOS: ['id', 'nome', 'outros', 'convite', 'presenca', 'respondidoEm', 'origem'],
  PRESENTES: ['id', 'categoria', 'nome', 'tipo', 'valor', 'prioridade', 'qtd', 'obs', 'link', 'mostrar']
};

// Textos gravados na planilha (iguais às listas suspensas e às fórmulas do resumo)
var PRESENCA = { SIM: 'Confirmado', NAO: 'Não vai', PENDENTE: 'Não confirmado' };
var TIPO = { ITEM: 'Item', COTA: 'Cota Pix' };
var MODO = { COMPRAR: 'Comprar', PIX: 'Pix' };
var PREFIXO_ID = { CONVIDADO: 'C', PRESENTE: 'P' };

var LIMITES = {
  VALIDADE_PEDIDO_MS: 5 * 60 * 1000, // pedido assinado vale 5 minutos (impede reaproveitar um pedido antigo)
  ESPERA_TRAVA_MS: 5000,              // espera máxima pela vez de gravar
  NOME: 120,
  RECADO: 500,
  ITENS_RESPOSTA: 50,
  VALOR_MAXIMO: 100000,               // R$
  DIAS_BACKUP: 30
};

var PROPRIEDADES = {
  SEGREDO: 'SEGREDO_API',
  ID_PRESENTES: 'ID_PLANILHA_PRESENTES',
  ID_CONVIDADOS: 'ID_PLANILHA_CONVIDADOS', // opcional: só se o script não estiver dentro da planilha de convidados
  EMAIL_ALERTA: 'EMAIL_ALERTA'             // opcional: padrão é o e-mail de quem instalou
};

var FUSO = 'America/Sao_Paulo';
var PASTA_BACKUPS = 'Backups – Casamento';
