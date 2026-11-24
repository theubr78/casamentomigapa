// Planilhas de teste com a MESMA estrutura das reais (convertidas do Excel), mas com nomes inventados.
const { Planilha } = require('./simulador');

const ID_CONVIDADOS = 'planilha-convidados-teste';
const ID_PRESENTES = 'planilha-presentes-teste';
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';

function planilhaConvidados(separador) {
  const p = (n, nome, lado, presenca, sexo) => [n, nome, lado, 'Amigos', 'Enviado', presenca, sexo, ''];
  return new Planilha(ID_CONVIDADOS, 'TESTE – Convidados', {
    'Lista de Convidados': [
      ['Lista de Convidados · Teste'],
      ['3 de julho de 2027 · Jaguaquara, BA'],
      [],
      ['Nº', 'Nome', 'Lado', 'Grupo', 'Save the date', 'Presença', 'Sexo', 'Observações'],
      p(1, 'Ana Teste Silva', 'Noivo', 'Não confirmado', 'F'),
      p(2, 'Bruno Exemplo', 'Noivo', 'Não confirmado', 'M'),
      p(3, 'Carla Modelo', 'Noiva', 'Não confirmado', 'F'),
      p(4, 'Zeca', 'Noiva', 'Não confirmado', 'M'),
      p(5, 'Namorado de Carla', 'Noiva', 'Não confirmado', 'M'),
      p(6, 'Diego Ficticio (pai)', 'Noivo', 'Não confirmado', 'M'),
      p(7, 'Elisa Demo', 'Amigos dos noivos', 'Não vai', 'F'),
      p(8, 'Fábio Amostra', 'Amigos dos noivos', 'Não confirmado', 'M'),
      [],
      [],
      [],
      ['', 'Resumo'],
      ['', '', 'Mulheres', 'Homens', 'Total'],
      ['', 'Adultos', '=C18-C17', '=D18-D17', '=C16+D16'],
      ['', 'Crianças', 8, 12, '=C17+D17'],
      ['', 'Total', '=COUNTIF($G$5:$G$12;"F")', '=COUNTIF($G$5:$G$12;"M")', '=C18+D18'],
      [],
      ['', 'Acompanhamento'],
      ['', 'Presença confirmada', '=COUNTIF($F$5:$F$12;"Confirmado")']
    ]
  }, separador);
}

function planilhaPresentes(separador) {
  const g = (n, cat, nome, tipo, valor, qtd, obs, link) => [n, cat, nome, tipo, valor, 'Alta', qtd, `=E${n + 5}*G${n + 5}`, 'Disponível', obs, link ? { texto: 'Ver fotos e lojas', link } : '—'];
  return new Planilha(ID_PRESENTES, 'TESTE – Presentes', {
    'Lista de Presentes': [
      ['Lista de Presentes · Teste'],
      ['03 de julho de 2027'],
      ['Edite as colunas em fundo bege.'],
      [],
      ['Nº', 'Categoria', 'Presente', 'Tipo', 'Valor (R$)', 'Prioridade', 'Qtd desejada', 'Total (R$)', 'Status', 'Observações', 'Fotos e lojas'],
      g(1, 'Cozinha', 'Jogo de panelas', 'Item', 600, 1, 'Aço inox ou cerâmica', 'https://www.google.com/search?tbm=shop&q=panelas'),
      g(2, 'Cozinha', 'Jogo de vasilhas', 'Item', 85, 2, '-', 'https://www.google.com/search?tbm=shop&q=vasilhas'),
      g(3, 'Lua de mel e momentos', 'Café da manhã na lua de mel', 'Cota Pix', 200, 3, '', null),
      g(4, 'Casa', 'Geladeira', 'Item', 3500, 1, '', 'javascript:alert(1)'),
      g(5, 'Casa', 'Presente sem tipo', '', 100, 1, '', null),
      [],
      ['', '', 'TOTAL DA LISTA', '', '', '', '=SUM(G6:G10)', '=SUM(H6:H10)']
    ],
    Resumo: [
      ['Resumo da Lista'],
      [],
      ['Categoria', 'Nº de presentes', 'Valor total (R$)', 'Recebido (R$)', '% recebido'],
      ['Cozinha', '=1', '=1', '=0', '=0'],
      ['Casa', '=1', '=1', '=0', '=0'],
      ['Lua de mel e momentos', '=1', '=1', '=0', '=0'],
      ['TOTAL', '=SUM(B4:B6)', '=SUM(C4:C6)', '=SUM(D4:D6)', '=0']
    ]
  }, separador);
}

module.exports = { planilhaConvidados, planilhaPresentes, ID_CONVIDADOS, ID_PRESENTES, SEGREDO };
