// src/db.js — Gestão de todos os ficheiros JSON
const fs = require('fs-extra');
const path = require('path');
const { BINGO_BOOK_CANON } = require('./naruto_data');

const DATA = path.join(__dirname, '..', 'data');

const FILES = {
  session:    path.join(DATA, 'session.json'),
  characters: path.join(DATA, 'characters.json'),
  npcs:       path.join(DATA, 'npcs.json'),
  relations:  path.join(DATA, 'relations.json'),
  bingo:      path.join(DATA, 'bingo.json'),
  knowledge:  path.join(DATA, 'knowledge.json'),
  conditions: path.join(DATA, 'conditions.json'),
  combat:     path.join(DATA, 'combat.json'),
  world:      path.join(DATA, 'world.json'),
  finance:    path.join(DATA, 'finance.json'),
  missions:   path.join(DATA, 'missions.json'),
  memory:     path.join(DATA, 'memory.json'),
};

// Estado vazio completamente limpo — sem valores hardcoded de lore anterior
const EMPTY_STATE = {
  session:    { messages: [], turn: 0, scene: '' },
  characters: { player: null, companion: null },
  npcs:       [],
  relations:  {},
  bingo:      BINGO_BOOK_CANON,
  knowledge:  { player: [], narrator: [], npcs: {} },
  conditions: { player: [], companion: [] },
  combat:     { active: false, turn: 0, min_turns: 4, participants: [], log: [] },
  world:      { location: '', date: '', time: '', weather: '', canon_arc: '' },
  finance:    { balance: 500, transactions: [], properties: [], quests: [] },
  missions:   { available: [], locked: [], completed: [], fame: 0, fame_title: 'Desconhecido', counts: {D:0,C:0,B:0,A:0,S:0}, last_generated: null, generating: false },
  memory:     { facts: [], narrator_notes: [] },
};

function initDB() {
  fs.ensureDirSync(DATA);
  fs.ensureDirSync(path.join(DATA, 'saves'));
  fs.ensureDirSync(path.join(DATA, 'docs'));
  fs.ensureDirSync(path.join(DATA, 'images'));

  // Inicializar apenas ficheiros que não existem — nunca sobrescrever
  for (const [key, defaultVal] of Object.entries(EMPTY_STATE)) {
    if (!fs.existsSync(FILES[key])) {
      fs.writeJsonSync(FILES[key], defaultVal, { spaces: 2 });
    }
  }
}

function read(key) { return fs.readJsonSync(FILES[key]); }
function write(key, data) { fs.writeJsonSync(FILES[key], data, { spaces: 2 }); }

function saveAll(name) {
  const savePath = path.join(DATA, 'saves', `${name}.json`);
  const snapshot = {};
  for (const key of Object.keys(FILES)) {
    if (fs.existsSync(FILES[key])) snapshot[key] = read(key);
  }
  // Guardar também inventário
  const invFile = path.join(DATA, 'inventory.json');
  if (fs.existsSync(invFile)) snapshot.inventory = fs.readJsonSync(invFile);
  snapshot.savedAt = new Date().toISOString();
  fs.writeJsonSync(savePath, snapshot, { spaces: 2 });
  return name;
}

function loadAll(name) {
  const savePath = path.join(DATA, 'saves', `${name}.json`);
  if (!fs.existsSync(savePath)) throw new Error('Save não encontrado');
  const snapshot = fs.readJsonSync(savePath);
  for (const key of Object.keys(FILES)) {
    if (snapshot[key] !== undefined) write(key, snapshot[key]);
  }
  // Restaurar inventário
  if (snapshot.inventory) {
    fs.writeJsonSync(path.join(DATA, 'inventory.json'), snapshot.inventory, { spaces: 2 });
  }
}

function listSaves() {
  const dir = path.join(DATA, 'saves');
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({
    name: f.replace('.json', ''),
    date: fs.statSync(path.join(dir, f)).mtime
  })).sort((a,b) => b.date - a.date);
}

function listDocs() {
  const dir = path.join(DATA, 'docs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
}

function loadDocs() {
  const dir = path.join(DATA, 'docs');
  if (!fs.existsSync(dir)) return '';
  let content = '';
  for (const f of listDocs()) {
    content += `\n\n--- ${f} ---\n${fs.readFileSync(path.join(dir, f), 'utf8')}`;
  }
  return content;
}

// Reset completo — apaga tudo e começa do zero
// Se keepCharacters=true, mantém personagens e inventário
function resetStory(keepCharacters = false) {
  const chars = keepCharacters ? read('characters') : null;
  const inv = keepCharacters ? (() => {
    const invFile = path.join(DATA, 'inventory.json');
    return fs.existsSync(invFile) ? fs.readJsonSync(invFile) : null;
  })() : null;

  // Apagar todos os ficheiros de estado
  for (const file of Object.values(FILES)) {
    if (fs.existsSync(file)) fs.removeSync(file);
  }
  const invFile = path.join(DATA, 'inventory.json');
  if (fs.existsSync(invFile) && !keepCharacters) fs.removeSync(invFile);

  // Apagar docs da história anterior
  const docsDir = path.join(DATA, 'docs');
  if (fs.existsSync(docsDir)) {
    fs.readdirSync(docsDir).forEach(f => fs.removeSync(path.join(docsDir, f)));
  }

  // Recriar com estado vazio
  initDB();

  // Restaurar personagens se pedido
  if (keepCharacters && chars) {
    write('characters', chars);
    if (inv) fs.writeJsonSync(invFile, inv, { spaces: 2 });
  }
}

// Adicionar facto à memória interna
function addMemoryFact(fact, type = 'player') {
  const memory = read('memory');
  if (type === 'narrator') memory.narrator_notes.push({ fact, date: new Date().toISOString() });
  else memory.facts.push({ fact, date: new Date().toISOString() });
  write('memory', memory);
}

module.exports = { initDB, read, write, saveAll, loadAll, listSaves, listDocs, loadDocs, resetStory, addMemoryFact, FILES, DATA };
