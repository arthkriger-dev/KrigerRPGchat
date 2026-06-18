// src/prompt.js — Construção do system prompt dinâmico
const { read, loadDocs } = require('./db');
const path = require('path');
const fs = require('fs-extra');

function buildSystemPrompt() {
  const chars = read('characters');
  const knowledge = read('knowledge');
  const conditions = read('conditions');
  const combat = read('combat');
  const world = read('world');
  const relations = read('relations');
  const docs = loadDocs();
  
  // Memória interna
  let memorySection = '';
  try {
    const memory = read('memory');
    const facts = memory.facts || [];
    const notes = memory.narrator_notes || [];
    if (facts.length > 0) memorySection += `\nFACTOS GUARDADOS (memória do jogador):\n${facts.slice(-20).map(f=>typeof f==='string'?f:f.fact).join('\n')}\n`;
    if (notes.length > 0) memorySection += `\nNOTAS DO NARRADOR:\n${notes.slice(-10).map(f=>typeof f==='string'?f:f.fact).join('\n')}\n`;
  } catch(_) {}

  const player = chars.player;
  const companion = chars.companion;

  // Personagem
  let charSection = '';
  if (player) {
    const playerConds = (conditions.player || []).filter(c => c.active);
    charSection += `
PERSONAGEM DO JOGADOR: ${player.name}
Clã: ${player.clan} | Idade: ${player.age} | Rank: ${player.rank} | Classe: ${player.class}
Aldeia: ${player.village} | Chakra: ${player.chakra}/${player.chakra_max}
${player.kekkei ? `Kekkei Genkai: ${player.kekkei}` : ''}
${player.physical_desc ? `APARÊNCIA (IMUTÁVEL): ${player.physical_desc}` : ''}
${player.description ? `Background: ${player.description}` : ''}
Jutsu: ${(player.jutsu || []).map(j => {
  let s = j.name;
  if (j.cost_max && j.cost_max > j.cost) s += ` [${j.cost}-${j.cost_max}ck]`;
  else if (j.cost) s += ` [${j.cost}ck]`;
  if (j.variations?.length) s += ` (${j.variations.map(v=>`${v.name}/${v.cost}ck`).join('/')})`;
  return s;
}).join(', ')}
${playerConds.length > 0 ? `Condições activas: ${playerConds.map(c => `${c.name} (${c.penalty})`).join(' | ')}` : ''}
`;
  }

  if (companion) {
    const compConds = (conditions.companion || []).filter(c => c.active);
    charSection += `
COMPANION (NPC Jogável): ${companion.name}
Clã: ${companion.clan} | Rank: ${companion.rank}
${companion.physical_desc ? `Aparência: ${companion.physical_desc}` : ''}
Chakra: ${companion.chakra}/${companion.chakra_max}
Jutsu: ${(companion.jutsu || []).map(j => j.name).join(', ')}
${compConds.length > 0 ? `Condições: ${compConds.map(c => c.name).join(' | ')}` : ''}
CONTROLO: Narrador + Jogador — podes narrar acções mas NUNCA decisões importantes sem o jogador.
`;
  }

  // Localização
  const locationSection = world.location
    ? `LOCALIZAÇÃO: ${world.location}${world.date ? ` | ${world.date}` : ''}${world.canon_arc ? ` | Arco: ${world.canon_arc}` : ''}`
    : '';

  // Combate
  const combatSection = combat.active
    ? `\nCOMBATE ACTIVO — TURNO ${combat.turn}/${combat.min_turns} mínimos | ${combat.participants.join(', ')}\nInimigos lutam para GANHAR. Mínimo ${combat.min_turns} turnos.`
    : '';

  // Relacionamentos com notas de vida
  const relEntries = Object.entries(relations);
  let relSection = '';
  if (relEntries.length > 0) {
    relSection = '\nRELACIONAMENTOS:\n' + relEntries.map(([name, rel]) => {
      const h = rel.hearts || 0;
      const hStr = h >= 1 ? '❤️'.repeat(Math.floor(h)) + (h % 1 >= 0.5 ? '½' : '') : '½';
      let line = `  ${name}: ${hStr} ${rel.status || ''} | 🤝${rel.friendship||0}% ⚡${rel.enmity||0}%`;
      if (rel.life_notes) line += `\n    Contexto: ${rel.life_notes}`;
      return line;
    }).join('\n');
  }

  // Conhecimento NPCs
  const npcKnow = Object.entries(knowledge.npcs || {});
  let npcKnowSection = '';
  if (npcKnow.length > 0) {
    npcKnowSection = '\nO QUE OS NPCs SABEM:\n' + npcKnow.map(([n,f]) => `  ${n}: ${f.join(' | ')}`).join('\n');
  }

  // Fama
  let fameSection = '';
  try {
    const missions = read('missions');
    if (missions.fame > 0) {
      fameSection = `\nFAMA: ${missions.fame}pts (${missions.fame_title}) | D:${missions.counts?.D||0} C:${missions.counts?.C||0} B:${missions.counts?.B||0} A:${missions.counts?.A||0} S:${missions.counts?.S||0}`;
      if (missions.fame >= 200) fameSection += '\n→ Fama ALTA: NPCs reconhecem o nome. Reagem com respeito ou medo.';
      else if (missions.fame >= 80) fameSection += '\n→ Fama MÉDIA: Alguns ninjas já ouviram falar.';
    }
  } catch(_) {}

  // Missões activas
  let missionsSection = '';
  try {
    const missions = read('missions');
    const locked = missions.locked || [];
    if (locked.length > 0) {
      missionsSection = '\nMISSÕES ACTIVAS:\n' + locked.map(m => `  [${m.rank}] ${m.title}: ${m.objective}`).join('\n');
    }
  } catch(_) {}

  // Conhecimento do jogador
  const playerKnow = (knowledge.player || []);
  let playerKnowSection = '';
  if (playerKnow.length > 0) {
    playerKnowSection = '\nO JOGADOR SABE:\n' + playerKnow.slice(-20).map(f => typeof f === 'string' ? `  ${f}` : `  ${f}`).join('\n');
  }

  return `És o NARRADOR de uma história de Naruto Shippuden (universo alternativo). Escreves em terceira pessoa, tempo passado, em Português Europeu.

REGRA #1 — NUNCA FALES PELO PERSONAGEM DO JOGADOR
NUNCA escreves diálogo, acções ou pensamentos do personagem controlado pelo jogador.
Descreves o mundo À VOLTA dele e PARAS. O jogador decide tudo o que o seu personagem faz.
ERRADO: "Naruto sorriu. 'Claro que sim!' disse ele."
CORRECTO: "A Sakura esperou. O silêncio do corredor pesava."

REGRA #2 — ANTI-METAGAMING
NPCs só sabem o que viram/ouviram organicamente. Nunca inventas informação não registada.
Konoha, Suna, Kiri, Kumo, Iwa, Ame = LOCALIZAÇÕES, nunca NPCs.

REGRA #3 — RELACIONAMENTOS ORGÂNICOS
NPCs com ½-1❤️: reservados, formais, não cedem facilmente.
Corações só sobem com acções reais: presentes, salvar, combate conjunto, conversas profundas.
Nunca presumir romance — deixar tensão existir sem a resolver.

REGRA #4 — COMBATE REAL
Inimigos lutam para GANHAR. Mínimo 4 turnos. Ferimentos persistem. Chakra não regenera sozinho.

REGRA #5 — MEMÓRIA
Os factos abaixo são a tua única fonte de verdade. Nunca inventas o que não está registado.
[ ] = comando fora de personagem. [memória: X] = guardar facto. [NPC] = criar NPC.
Responde SEMPRE em Português Europeu. Nunca uses inglês.
${charSection ? '\n' + charSection : ''}
${locationSection}
${combatSection}
${relSection}
${npcKnowSection}
${playerKnowSection}
${memorySection}
${fameSection}
${missionsSection}
${docs ? '\nDOCUMENTOS:\n' + docs : ''}`;
}

function checkViolation(text, playerName) {
  if (!playerName) return [];
  const name = playerName.split(' ')[0];
  const patterns = [
    new RegExp(`${name}\\s+(disse|perguntou|respondeu|murmurou|exclamou)`, 'gi'),
    new RegExp(`${name}\\s+(olhou|viu|sentiu|pensou|decidiu|sorriu|franziu)`, 'gi'),
    new RegExp(`"[^"]*",?\\s+disse\\s+${name}`, 'gi'),
  ];
  const violations = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) violations.push(...m);
  }
  return violations;
}

function detectConditions(text) {
  const triggers = [
    { keywords: ['a sangrar', 'sangue a escorrer'], id: 'bleeding', name: 'A sangrar', penalty: 'Perde 50 chakra/turno' },
    { keywords: ['envenenado', 'veneno a actuar'], id: 'poisoned', name: 'Envenenado', penalty: '-20 chakra/turno' },
    { keywords: ['inconsciente', 'colapsa', 'caiu'], id: 'unconscious', name: 'Inconsciente', penalty: 'Sem acção possível' },
    { keywords: ['genjutsu', 'ilusão activada'], id: 'genjutsu', name: 'Sob Genjutsu', penalty: 'Percepção alterada' },
    { keywords: ['exausto', 'sem chakra'], id: 'exhausted', name: 'Exausto', penalty: 'Jutsu bloqueados' },
  ];
  const lower = text.toLowerCase();
  return triggers.filter(t => t.keywords.some(k => lower.includes(k)));
}

module.exports = { buildSystemPrompt, checkViolation, detectConditions };
