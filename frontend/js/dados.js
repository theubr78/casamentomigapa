/* Conteúdo estático das "Dicas da região".
   Cada item: [nome, tipo, local, telefone | null, instagram | null, logo]
   O logo aponta para assets/logos/<número>.jpg. */
window.DICAS = [
  {
    id: 'onde-ficar', titulo: 'Onde ficar', nota: 'Reserve com antecedência.',
    itens: [
      ['Hotel Solari', 'Hotel', 'Entroncamento (BR-116, km 43)', '(73) 99919-3184', 'hotel_solari', 202],
      ['Hotel Irmãos Vaz BR-116', 'Hotel', 'Entroncamento (BR-116, km 43)', '(73) 98820-2505', null, 204],
      ['Pousada Paraná', 'Pousada', 'BR-116, km 636', '(73) 99156-2806', null, 206],
      ['Hotel Irmãos Vaz', 'Hotel', 'Centro de Jaguaquara', '(73) 3534-2505', null, 204],
      ['Hotel Visão', 'Hotel', 'Centro de Jaguaquara', '(73) 3534-1722', null, 208],
      ['Torre Hotel Jaguaquara', 'Hotel', 'Centro de Jaguaquara', '(73) 98841-9475', null, 210]
    ]
  },
  {
    id: 'onde-comer', titulo: 'Onde comer', nota: '',
    itens: [
      ['Cand', 'Hambúrguer e açaí', 'Entroncamento', '(73) 98885-4407', null, 212],
      ['Restaurante José', 'Restaurante', 'Jaguaquara', '(73) 99127-4069', null, 214],
      ['Restaurante a Cabana', 'Restaurante', 'Jaguaquara', '(73) 98837-6061', null, 216],
      ['Recanto Steakhouse', 'Carnes', 'Centro de Jaguaquara', '(73) 98839-8860', null, 218],
      ['Texas Gastronomia', 'Japonês e mais', 'Jaguaquara', '(73) 99186-3240', null, 220],
      ['Ristorante Biancamano', 'Italiano', 'Jaguaquara', '(73) 3534-1078', null, 222],
      ['Sabores Bistrô', 'Bistrô e vinhos', 'Jaguaquara', '(73) 99869-7764', null, 224],
      ['Doce Onça', 'Doceria e café', 'Jaguaquara', '(73) 98812-7193', null, 226],
      ['Café Ouro Negro', 'Café', 'Jaguaquara', null, null, 228]
    ]
  },
  {
    id: 'beleza', titulo: 'Beleza', nota: 'Agende com antecedência.',
    itens: [
      ['Studio Meire Costa', 'Beleza', 'Jaguaquara', '(73) 98825-0524', null, 230],
      ['Érica Ribeiro Studio Beauty', 'Beleza', 'Jaguaquara', '(73) 99116-8205', null, 232],
      ["Milly San's", 'Beleza', 'Jaguaquara', '(73) 99115-8318', null, 234],
      ['Instituto Ivonete Marques', 'Estética e beleza', 'Jaguaquara', '(73) 99923-8913', 'esteticaivonetemarques', 236],
      ['Jenilda Reis Studio de Beleza', 'Studio de beleza', 'Jaguaquara', null, 'jenildareisstudiodebeleza', 238],
      ['Ilana Gonçalves Studio de Beleza', 'Salão de beleza', 'Jaguaquara', null, 'salaoilanagoncalves', 240]
    ]
  }
];
