// src/naruto_data.js — Clãs, Jutsu, Aldeias, Ranks

const ALDEIAS = [
  'Konoha (Vila Oculta da Folha)',
  'Suna (Vila Oculta da Areia)',
  'Kiri (Vila Oculta da Névoa)',
  'Kumo (Vila Oculta das Nuvens)',
  'Iwa (Vila Oculta da Pedra)',
  'Oto (Vila do Som)',
  'Ame (Vila da Chuva)',
  'Taki (Vila da Cachoeira)',
  'Kusa (Vila da Erva)',
  'Tani (Vila do Vale)',
  'Não Afiliado',
  'Akatsuki',
  'Root (Raiz — ANBU)',
  'Konton',
  'Outro'
];

const RANKS = ['Sem Rank', 'Academy Student', 'Genin', 'Chūnin', 'Tokubetsu Jōnin', 'Jōnin', 'ANBU', 'Kage', 'S-Rank Criminal'];

const CLASSES = [
  'Ninjutsu', 'Genjutsu', 'Taijutsu', 'Médico-ninja',
  'Sensor', 'Invocador', 'Puppeteer', 'Jinchūriki',
  'Kekkei Genkai', 'Fūinjutsu', 'Kenjutsu', 'Híbrido'
];

const ASSOCIACOES = [
  'Nenhuma', 'Akatsuki', 'Root (ANBU Danzō)', 'Konton',
  'Sete Espadachins de Kiri', 'ANBU Konoha', 'ANBU Kiri',
  'ANBU Kumo', 'Guardas do Kazekage', 'Guardas do Raikage',
  'Mercenário', 'Caçador de Recompensas', 'Outro'
];

const CLANS = [
  { name: 'Uchiha', kekkei: 'Sharingan / Mangekyō Sharingan', aldeia: 'Konoha' },
  { name: 'Hyūga', kekkei: 'Byakugan', aldeia: 'Konoha' },
  { name: 'Nara', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Akimichi', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Yamanaka', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Sarutobi', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Aburame', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Inuzuka', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Senju', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Uzumaki', kekkei: 'Nenhum (selamento)', aldeia: 'Uzushio/Konoha' },
  { name: 'Hatake', kekkei: 'Nenhum', aldeia: 'Konoha' },
  { name: 'Yuki', kekkei: 'Hyōton (Liberação de Gelo)', aldeia: 'Kiri' },
  { name: 'Hōzuki', kekkei: 'Hydrification', aldeia: 'Kiri' },
  { name: 'Suigetsu', kekkei: 'Hydrification', aldeia: 'Kiri' },
  { name: 'Terumii', kekkei: 'Lava Release / Boil Release', aldeia: 'Kiri' },
  { name: 'Momochi', kekkei: 'Nenhum', aldeia: 'Kiri' },
  { name: 'Sabaku (Gaara)', kekkei: 'Magnetismo da Areia', aldeia: 'Suna' },
  { name: 'Chiyo', kekkei: 'Nenhum', aldeia: 'Suna' },
  { name: 'Kazekage', kekkei: 'Dust Release / Magnetism', aldeia: 'Suna/Iwa' },
  { name: 'Tsuchikage', kekkei: 'Dust Release', aldeia: 'Iwa' },
  { name: 'Kamizuru', kekkei: 'Nenhum (abelhas)', aldeia: 'Iwa' },
  { name: 'Raikage (A)', kekkei: 'Nenhum', aldeia: 'Kumo' },
  { name: 'Yugito Nii', kekkei: 'Jinchūriki (Duas Caudas)', aldeia: 'Kumo' },
  { name: 'Nii (Killer Bee)', kekkei: 'Jinchūriki (Oito Caudas)', aldeia: 'Kumo' },
  { name: 'Otsutsuki', kekkei: 'Byakugan / Tenseigan', aldeia: 'Nenhuma' },
  { name: 'Orochimaru', kekkei: 'Nenhum (experimentos)', aldeia: 'Oto' },
  { name: 'Jashin (Hidan)', kekkei: 'Imortalidade', aldeia: 'Sem aldeia' },
  { name: 'Kakuzu', kekkei: 'Nenhum (fios/máscaras)', aldeia: 'Sem aldeia' },
  { name: 'Sem Clã', kekkei: 'Nenhum', aldeia: 'Variável' },
  { name: 'Clã Original (criar)', kekkei: 'Definir manualmente', aldeia: 'Variável' }
];

const JUTSU_POR_CLA = {
  'Uchiha': [
    { name: 'Sharingan', cost: 0, desc: 'Dōjutsu — copia técnicas, vê chakra, antecipa movimentos', rank: 'B' },
    { name: 'Mangekyō Sharingan', cost: 100, desc: 'Forma evoluída — Amaterasu, Tsukuyomi, Susanoo', rank: 'S', warning: true },
    { name: 'Fireball Jutsu (Katon)', cost: 40, desc: 'Grande bola de fogo — técnica básica do clã Uchiha', rank: 'C' },
    { name: 'Amaterasu', cost: 150, desc: 'Chamas negras que queimam tudo — não se apagam', rank: 'S', warning: true },
    { name: 'Susanoo', cost: 200, desc: 'Avatar colossal de chakra que envolve o utilizador', rank: 'S', warning: true }
  ],
  'Hyūga': [
    { name: 'Byakugan', cost: 0, desc: 'Dōjutsu — visão 360º, vê chakra e tenketsu', rank: 'B' },
    { name: 'Gentle Fist (Jūken)', cost: 20, desc: 'Ataque aos tenketsu — bloqueia fluxo de chakra', rank: 'B' },
    { name: 'Eight Trigrams 64 Palms', cost: 60, desc: 'Série de ataques aos 64 pontos de chakra do adversário', rank: 'A' },
    { name: 'Eight Trigrams Rotation', cost: 80, desc: 'Rotação defensiva que repele ataques com chakra', rank: 'A' }
  ],
  'Nara': [
    { name: 'Shadow Possession (Kagemane)', cost: 30, desc: 'Imobiliza o adversário espelhando os seus movimentos', rank: 'C' },
    { name: 'Shadow Strangle (Kageyori)', cost: 50, desc: 'Estrangula o adversário com a sombra', rank: 'B' },
    { name: 'Shadow Pull (Kageyose)', cost: 40, desc: 'Puxa objectos ou inimigos com a sombra', rank: 'C' }
  ],
  'Yuki': [
    { name: 'Ice Mirror (Makyō Hyōshō)', cost: 60, desc: 'Cria espelhos de gelo para atacar e defender', rank: 'B' },
    { name: 'Ice Clone', cost: 45, desc: 'Clone de gelo por unidade', rank: 'C' },
    { name: 'Ice Prison', cost: 40, desc: 'Prisão de gelo — imobiliza alvo', rank: 'C' },
    { name: 'Glacial Age', cost: 300, desc: 'Congela tudo num raio de 1km a partir do solo', rank: 'S', warning: true },
    { name: 'Blizzard Jutsu', cost: 80, desc: 'Tempestade de gelo e neve — baixa visibilidade e temperatura', rank: 'B' }
  ],
  'Uzumaki': [
    { name: 'Rasengan', cost: 50, desc: 'Esfera de chakra rotativo concentrado na palma', rank: 'A' },
    { name: 'Shadow Clone (Kage Bunshin)', cost: 30, desc: 'Clone real com chakra próprio', rank: 'B' },
    { name: 'Fūinjutsu — Seal', cost: 40, desc: 'Técnica de selamento — imobiliza ou guarda chakra', rank: 'B' },
    { name: 'Adamantine Sealing Chains', cost: 100, desc: 'Correntes de chakra que aprisionam bijuu', rank: 'S' }
  ],
  'Sem Clã': [
    { name: 'Substitution Jutsu', cost: 5, desc: 'Substitui-se por um objecto para escapar', rank: 'E' },
    { name: 'Transformation Jutsu', cost: 5, desc: 'Transforma-se noutro ser ou objecto', rank: 'E' },
    { name: 'Clone Jutsu', cost: 5, desc: 'Clone de ilusão sem substância', rank: 'E' },
    { name: 'Kunai Throw', cost: 0, desc: 'Arremesso de kunai com precisão', rank: 'D' }
  ]
};

// Jutsu genéricos disponíveis para qualquer personagem
const JUTSU_GENERICOS = [
  { name: 'Substitution Jutsu', cost: 5, desc: 'Substitui-se por um objecto para escapar', rank: 'E' },
  { name: 'Transformation Jutsu', cost: 5, desc: 'Transforma-se noutro ser ou objecto', rank: 'E' },
  { name: 'Clone Jutsu', cost: 5, desc: 'Clone de ilusão sem substância', rank: 'E' },
  { name: 'Kunai/Shuriken', cost: 0, desc: 'Armas de arremesso padrão shinobi', rank: 'D' },
  { name: 'Tree Walking / Water Walking', cost: 10, desc: 'Controlo de chakra para andar em superfícies', rank: 'D' }
];

// Bingo Book inicial (canon)
const BINGO_BOOK_CANON = [
  { name: 'Itachi Uchiha', clan: 'Uchiha', rank: 'S', aldeia: 'Konoha (desertou)', crime: 'Massacre do clã Uchiha', recompensa: 'Vivo preferível' },
  { name: 'Kisame Hoshigaki', clan: 'Sem Clã', rank: 'S', aldeia: 'Kiri (desertou)', crime: 'Traição a Kiri — Sete Espadachins', recompensa: 'Alta' },
  { name: 'Orochimaru', clan: 'Sem Clã', rank: 'S', aldeia: 'Konoha (desertou)', crime: 'Experimentos humanos — ataque a Konoha', recompensa: 'Muito alta' },
  { name: 'Deidara', clan: 'Sem Clã', rank: 'S', aldeia: 'Iwa (desertou)', crime: 'Traição a Iwa — explosões em civis', recompensa: 'Alta' },
  { name: 'Sasori', clan: 'Chiyo', rank: 'S', aldeia: 'Suna (desertou)', crime: 'Assassinato do Kazekage — Puppeteer', recompensa: 'Muito alta' },
  { name: 'Hidan', clan: 'Sem Clã', rank: 'S', aldeia: 'Sem aldeia', crime: 'Culto Jashin — múltiplos assassinatos rituais', recompensa: 'Alta' },
  { name: 'Kakuzu', clan: 'Sem Clã', rank: 'S', aldeia: 'Taki (desertou)', crime: 'Tentativa de assassinato do Primeiro Hokage', recompensa: 'Muito alta' },
  { name: 'Tobi', clan: 'Desconhecido', rank: 'S', aldeia: 'Desconhecida', crime: 'Ataque a Konoha — Akatsuki', recompensa: 'Máxima — identidade desconhecida' },
  { name: 'Sasuke Uchiha', clan: 'Uchiha', rank: 'A', aldeia: 'Konoha (desertou)', crime: 'Deserção — associação com Orochimaru', recompensa: 'Média (Konoha quer vivo)' }
];

module.exports = { ALDEIAS, RANKS, CLASSES, ASSOCIACOES, CLANS, JUTSU_POR_CLA, JUTSU_GENERICOS, BINGO_BOOK_CANON };

// Localizações canon — para distinguir de NPCs
const LOCATIONS = [
  // Aldeias principais
  'Konoha','Suna','Kiri','Kumo','Iwa','Oto','Ame','Taki','Kusa','Tani','Uzushio',
  // Países
  'Hi no Kuni','Kaze no Kuni','Mizu no Kuni','Kaminari no Kuni','Tsuchi no Kuni',
  'Umi no Kuni','Nami no Kuni','Kawa no Kuni','Cha no Kuni','Yuki no Kuni',
  // Locais específicos
  'Akatsuki','Root','Konoha Hospital','Academia','Hokage','Kazekage','Mizukage',
  'Raikage','Tsuchikage','Bijuu','Kyuubi','Biju',
  // Títulos que não são nomes
  'Sensei','Sama','Kun','Chan','San','Dono','Shishou'
];

// Nomes canon conhecidos (não criar automaticamente — já existem no lore)
const CANON_NPCS = [
  'Naruto','Sasuke','Sakura','Kakashi','Tsunade','Jiraiya','Orochimaru',
  'Itachi','Kisame','Deidara','Sasori','Hidan','Kakuzu','Tobi','Pain','Konan',
  'Minato','Kushina','Hiruzen','Danzo','Shikamaru','Ino','Choji','Neji',
  'Lee','Tenten','Hinata','Kiba','Shino','Gaara','Temari','Kankuro',
  'Tsunade','Shizune','Anko','Kurenai','Asuma','Gai','Yamato','Sai',
  'Killer Bee','Yugito','Raikage','Mei','Chojuro','Ao','Pakura','Mifune',
  'Nagato','Konan','Zetsu','Obito','Madara','Hashirama','Tobirama'
];

module.exports = { ALDEIAS, RANKS, CLASSES, ASSOCIACOES, CLANS, JUTSU_POR_CLA, JUTSU_GENERICOS, BINGO_BOOK_CANON, LOCATIONS, CANON_NPCS };
