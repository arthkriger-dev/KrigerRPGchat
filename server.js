require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const { initDB, read, write, saveAll, loadAll, listSaves, DATA } = require('./src/db');
const { callAI, API_TYPE } = require('./src/api');
const { buildSystemPrompt, checkViolation, detectConditions } = require('./src/prompt');
const { ALDEIAS, RANKS, CLASSES, ASSOCIACOES, CLANS, JUTSU_POR_CLA, JUTSU_GENERICOS, BINGO_BOOK_CANON } = require('./src/naruto_data');

initDB();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ═══════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  try {
    const { message, images } = req.body;
    const session = read('session');
    const combat = read('combat');

    // Memória automática [memória: ...] ou [memoria: ...]
    const memMatch = message.match(/\[mem[oó]ria:\s*(.+?)\]/gi);
    if (memMatch) {
      const { addMemoryFact } = require('./src/db');
      memMatch.forEach(m => {
        const fact = m.replace(/\[mem[oó]ria:\s*/i, '').replace(/\]/, '').trim();
        addMemoryFact(fact, 'player');
      });
    }

    // Trigger [NPC] — retorna flag para frontend abrir modal de criação
    const npcTrigger = message.includes('[NPC]') || message.includes('[npc]');
    // Extrair nome sugerido se vier junto: [NPC: Yugito] ou [NPC Yugito]
    const npcNameMatch = message.match(/\[NPC[:\s]+([^\]]+)\]/i);
    const npcSuggestedName = npcNameMatch ? npcNameMatch[1].trim() : null;

    // Detecção automática de pagamentos na mensagem do jogador
    // Detecta padrões: "pago X ryō", "compro X por Y", "dou X ryō", "pago X"
    let autoPayment = null;
    const payPatterns = [
      /(?:pago|pagar|dei|dou|gasto|gastei)\s+(\d+)\s*(?:ryō|ryo|moedas?)?/i,
      /(?:compro|comprei|compra)\s+.{1,30}\s+(?:por|a)\s+(\d+)\s*(?:ryō|ryo)?/i,
      /(\d+)\s*(?:ryō|ryo)\s+(?:pagos?|gastos?)/i,
    ];
    for (const pat of payPatterns) {
      const m = message.match(pat);
      if (m) {
        const amount = parseInt(m[1]);
        if (amount > 0 && amount < 100000) {
          const fin = read('finance');
          if (fin.balance >= amount) {
            fin.balance -= amount;
            fin.transactions.unshift({ amount: -amount, description: `Auto: ${message.substring(0, 60)}`, date: new Date().toISOString() });
            write('finance', fin);
            autoPayment = { amount, balance: fin.balance };
          }
        }
        break;
      }
    }

    // Avançar turno combate
    if (combat.active) {
      combat.turn++;
      combat.log.push({ turn: combat.turn, action: message.substring(0, 100) });
      write('combat', combat);
    }

    session.messages.push({ role: 'user', content: message });
    session.turn++;

    const historyLimit = parseInt(process.env.HISTORY_LIMIT || '20');
    const recentMessages = session.messages.slice(-historyLimit);
    const systemPrompt = buildSystemPrompt();

    const result = await callAI(systemPrompt, recentMessages, images || []);

    const chars = read('characters');
    const playerName = chars.player?.name || '';
    const violations = checkViolation(result.text, playerName);
    const detectedConds = detectConditions(result.text);

    // NPCs detectados automaticamente DESACTIVADO — só via [NPC]
    // (evita falsos positivos com localizações e nomes canon)
    const detectedNPCs = npcTrigger ? [] : [];

    res.json({
      message: result.text,
      violations,
      detectedConditions: detectedConds,
      detectedNPCs,
      npcTrigger,
      npcSuggestedName,
      turn: session.turn,
      tokensUsed: result.tokens,
      combatTurn: combat.active ? combat.turn : null,
      autoPayment
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// CHARACTERS
// ═══════════════════════════════════════════
app.get('/api/characters', (req, res) => res.json(read('characters')));

app.post('/api/characters/create', (req, res) => {
  try {
    const { slot, data } = req.body; // slot: 'player' | 'companion'
    const chars = read('characters');
    chars[slot] = {
      ...data,
      chakra: data.chakra_max || 500,
      chakra_max: data.chakra_max || 500,
      ryou: data.ryou || 500,
      injuries: []
    };
    write('characters', chars);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/characters/chakra', (req, res) => {
  try {
    const { slot, amount } = req.body;
    const chars = read('characters');
    chars[slot].chakra = Math.max(0, Math.min(chars[slot].chakra_max, chars[slot].chakra + amount));
    write('characters', chars);
    res.json({ success: true, chakra: chars[slot].chakra });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/characters/use_jutsu', (req, res) => {
  try {
    const { slot, jutsu_id } = req.body;
    const chars = read('characters');
    const char = chars[slot];
    const jutsu = (char.jutsu || []).find(j => j.id === jutsu_id || j.name === jutsu_id);
    if (!jutsu) return res.status(404).json({ error: 'Jutsu não encontrado' });
    const pct = (char.chakra / char.chakra_max) * 100;
    if (pct <= 10) return res.json({ success: false, reason: 'Chakra crítico — bloqueado' });
    if (char.chakra < jutsu.cost) return res.json({ success: false, reason: 'Chakra insuficiente' });
    char.chakra -= jutsu.cost;
    write('characters', chars);
    res.json({ success: true, chakra: char.chakra, jutsu_name: jutsu.name, cost: jutsu.cost });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/characters/add_jutsu', (req, res) => {
  try {
    const { slot, jutsu } = req.body;
    const chars = read('characters');
    if (!chars[slot].jutsu) chars[slot].jutsu = [];
    chars[slot].jutsu.push({ ...jutsu, id: 'custom_' + Date.now() });
    write('characters', chars);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/characters/portrait', (req, res) => {
  try {
    const { slot, image } = req.body;
    const chars = read('characters');
    chars[slot].portrait = image;
    write('characters', chars);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// NPCs
// ═══════════════════════════════════════════
app.get('/api/npcs', (req, res) => res.json(read('npcs')));

app.post('/api/npcs/create', (req, res) => {
  try {
    const npc = { ...req.body, id: 'npc_' + Date.now(), hearts: 1, friendship: 0, enmity: 0 };
    const npcs = read('npcs');
    npcs.push(npc);
    write('npcs', npcs);
    // Inicializar relação
    const rel = read('relations');
    rel[npc.name] = { hearts: 1, friendship: 0, enmity: 0, status: 'Desconhecidos', last_interaction: null };
    write('relations', rel);
    res.json({ success: true, npc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/npcs/update', (req, res) => {
  try {
    const { id, updates } = req.body;
    const npcs = read('npcs');
    const idx = npcs.findIndex(n => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'NPC não encontrado' });
    npcs[idx] = { ...npcs[idx], ...updates };
    write('npcs', npcs);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/npcs/:id', (req, res) => {
  try {
    const npcs = read('npcs').filter(n => n.id !== req.params.id);
    write('npcs', npcs);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// RELACIONAMENTOS
// ═══════════════════════════════════════════
app.get('/api/relations', (req, res) => res.json(read('relations')));

app.post('/api/relations/update', (req, res) => {
  try {
    const { name, delta_hearts, delta_friendship, delta_enmity, note } = req.body;
    const rel = read('relations');
    if (!rel[name]) rel[name] = { hearts: 1, friendship: 0, enmity: 0, status: 'Desconhecidos', last_interaction: null };
    const r = rel[name];
    if (delta_hearts) r.hearts = Math.max(0, Math.min(5, r.hearts + delta_hearts));
    if (delta_friendship) r.friendship = Math.max(0, Math.min(100, r.friendship + delta_friendship));
    if (delta_enmity) r.enmity = Math.max(0, Math.min(100, r.enmity + delta_enmity));
    r.last_interaction = new Date().toISOString();
    if (note) r.last_note = note;
    // Actualizar status
    if (r.hearts >= 5) r.status = 'Vínculo Profundo';
    else if (r.hearts >= 4) r.status = 'Intimidade';
    else if (r.hearts >= 3) r.status = 'Namoro';
    else if (r.hearts >= 2) r.status = 'Amizade';
    else r.status = 'Conhecidos';
    write('relations', rel);
    res.json({ success: true, relation: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// BINGO BOOK
// ═══════════════════════════════════════════
app.get('/api/bingo', (req, res) => res.json(read('bingo')));

app.post('/api/bingo/add', (req, res) => {
  try {
    const entry = { ...req.body, id: 'bb_' + Date.now(), added: new Date().toISOString() };
    const bingo = read('bingo');
    bingo.push(entry);
    write('bingo', bingo);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// CONDITIONS
// ═══════════════════════════════════════════
app.get('/api/conditions', (req, res) => res.json(read('conditions')));

app.post('/api/conditions/add', (req, res) => {
  try {
    const { slot, condition } = req.body;
    const cond = read('conditions');
    if (!cond[slot]) cond[slot] = [];
    if (!cond[slot].find(c => c.id === condition.id)) {
      cond[slot].push({ ...condition, active: true });
    } else {
      cond[slot].find(c => c.id === condition.id).active = true;
    }
    write('conditions', cond);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conditions/toggle', (req, res) => {
  try {
    const { slot, id, active } = req.body;
    const cond = read('conditions');
    const c = (cond[slot] || []).find(c => c.id === id);
    if (c) c.active = active;
    write('conditions', cond);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conditions/remove', (req, res) => {
  try {
    const { slot, id } = req.body;
    const cond = read('conditions');
    cond[slot] = (cond[slot] || []).filter(c => c.id !== id);
    write('conditions', cond);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// COMBAT
// ═══════════════════════════════════════════
app.get('/api/combat', (req, res) => res.json(read('combat')));

app.post('/api/combat/start', (req, res) => {
  try {
    write('combat', { active: true, turn: 0, min_turns: req.body.min_turns || 4, participants: req.body.participants || [], log: [] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/combat/end', (req, res) => {
  try {
    const c = read('combat');
    c.active = false;
    write('combat', c);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/combat/next_turn', (req, res) => {
  try {
    const c = read('combat');
    if (c.active) { c.turn++; write('combat', c); }
    res.json({ success: true, turn: c.turn });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// WORLD / LOCALIZAÇÃO
// ═══════════════════════════════════════════
app.get('/api/world', (req, res) => res.json(read('world')));

app.post('/api/world/update', (req, res) => {
  try {
    const world = { ...read('world'), ...req.body };
    write('world', world);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/world/teleport', (req, res) => {
  try {
    const { destination, chakra_cost } = req.body;
    const chars = read('characters');
    const world = read('world');
    if (chars.player.chakra < chakra_cost) return res.json({ success: false, reason: 'Chakra insuficiente para teleporte' });
    chars.player.chakra -= chakra_cost;
    world.last_location = world.location;
    world.location = destination;
    write('characters', chars);
    write('world', world);
    res.json({ success: true, chakra: chars.player.chakra, location: destination });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// FINANÇAS
// ═══════════════════════════════════════════
app.get('/api/finance', (req, res) => res.json(read('finance')));

app.post('/api/finance/transaction', (req, res) => {
  try {
    const { amount, description, type } = req.body; // type: 'income' | 'expense'
    const finance = read('finance');
    const delta = type === 'income' ? Math.abs(amount) : -Math.abs(amount);
    finance.balance += delta;
    finance.transactions.unshift({ amount: delta, description, date: new Date().toISOString() });
    if (finance.transactions.length > 50) finance.transactions = finance.transactions.slice(0, 50);
    write('finance', finance);
    res.json({ success: true, balance: finance.balance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance/property', (req, res) => {
  try {
    const finance = read('finance');
    finance.properties.push({ ...req.body, id: 'prop_' + Date.now() });
    write('finance', finance);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance/property/image', (req, res) => {
  try {
    const { id, image } = req.body;
    const finance = read('finance');
    const prop = finance.properties.find(p => p.id === id);
    if (prop) prop.image = image;
    write('finance', finance);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance/quest', (req, res) => {
  try {
    const finance = read('finance');
    finance.quests.push({ ...req.body, id: 'quest_' + Date.now(), completed: false });
    write('finance', finance);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance/quest/complete', (req, res) => {
  try {
    const { id } = req.body;
    const finance = read('finance');
    const quest = finance.quests.find(q => q.id === id);
    if (quest && !quest.completed) {
      quest.completed = true;
      finance.balance += quest.reward || 0;
      finance.transactions.unshift({ amount: quest.reward || 0, description: `Quest: ${quest.name}`, date: new Date().toISOString() });
    }
    write('finance', finance);
    res.json({ success: true, balance: finance.balance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// KNOWLEDGE
// ═══════════════════════════════════════════
app.get('/api/knowledge', (req, res) => res.json(read('knowledge')));

app.post('/api/knowledge/player', (req, res) => {
  try {
    const k = read('knowledge');
    k.player.push(req.body.fact);
    write('knowledge', k);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/knowledge/npc', (req, res) => {
  try {
    const { npc, fact } = req.body;
    const k = read('knowledge');
    if (!k.npcs[npc]) k.npcs[npc] = [];
    k.npcs[npc].push(fact);
    write('knowledge', k);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// DOCS
// ═══════════════════════════════════════════
app.get('/api/docs', (req, res) => {
  const dir = path.join(DATA, 'docs');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  res.json({ files });
});

app.post('/api/docs/upload', (req, res) => {
  try {
    const { filename, content } = req.body;
    fs.writeFileSync(path.join(DATA, 'docs', filename), content, 'utf8');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/docs/:filename', (req, res) => {
  try {
    fs.removeSync(path.join(DATA, 'docs', req.params.filename));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// SAVES
// ═══════════════════════════════════════════
app.get('/api/saves', (req, res) => res.json({ saves: listSaves() }));

app.post('/api/save', (req, res) => {
  try {
    const name = req.body.name || `save_${Date.now()}`;
    saveAll(name);
    res.json({ success: true, name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/load/:name', (req, res) => {
  try {
    loadAll(req.params.name);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// NOVA HISTÓRIA
// ═══════════════════════════════════════════
app.post('/api/new_story', (req, res) => {
  try {
    const { resetCharacters } = req.body;
    const { resetStory } = require('./src/db');
    // Reset completo — apaga docs, knowledge, world, etc.
    // keepCharacters=true mantém personagens e inventário
    resetStory(!resetCharacters);
    // Inventário: vazio se resetar personagens, manter se não
    if (resetCharacters) {
      fs.writeJsonSync(INV_FILE, { player: [], companion: [] }, { spaces: 2 });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// NARUTO DATA (para o wizard de criação)
// ═══════════════════════════════════════════
app.get('/api/naruto_data', (req, res) => {
  res.json({ ALDEIAS, RANKS, CLASSES, ASSOCIACOES, CLANS, JUTSU_POR_CLA, JUTSU_GENERICOS });
});

app.get('/api/history', (req, res) => {
  const session = read('session');
  res.json({ messages: session.messages, turn: session.turn });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🧊 Hakurō RP Engine V4 — ${API_TYPE.toUpperCase()}`);
  console.log(`📱 Local: http://localhost:${PORT}`);
  console.log(`📱 Rede:  http://[SEU_IP]:${PORT}\n`);
});

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// INVENTÁRIO
// ═══════════════════════════════════════════
const INVENTORY_DEFAULT = {
  player: [],
  companion: []
};

const SHOP_ITEMS = [
  // ARMAS
  { id: 'kunai', name: 'Kunai', icon: '🗡️', type: 'arma', chakra_restore: 0, desc: 'Arma de arremesso padrão shinobi', price: 15 },
  { id: 'shuriken', name: 'Shuriken', icon: '✴️', type: 'arma', chakra_restore: 0, desc: 'Estrela ninja de arremesso', price: 10 },
  { id: 'senbon', name: 'Senbon', icon: '📍', type: 'arma', chakra_restore: 0, desc: 'Agulha ninja — precisão cirúrgica', price: 8 },
  { id: 'tanto', name: 'Tanto', icon: '🔪', type: 'arma', chakra_restore: 0, desc: 'Faca de combate próximo', price: 300 },
  { id: 'ninjato', name: 'Ninjato', icon: '⚔️', type: 'arma', chakra_restore: 0, desc: 'Espada ninja curta', price: 600 },
  { id: 'kusarigama', name: 'Kusarigama', icon: '⛓️', type: 'arma', chakra_restore: 0, desc: 'Foice com corrente — alcance e controlo', price: 450 },
  { id: 'wire', name: 'Arame Ninja', icon: '🪢', type: 'arma', chakra_restore: 0, desc: 'Armadilhas, escalar, prender', price: 20 },
  // EXPLOSIVOS E ITENS DE COMBATE
  { id: 'smoke_bomb', name: 'Bomba de Fumo', icon: '💨', type: 'item', chakra_restore: 0, desc: 'Cobre fuga ou distracção', price: 30 },
  { id: 'explosive_tag', name: 'Selo Explosivo', icon: '💥', type: 'item', chakra_restore: 0, desc: 'Explode ao activar chakra', price: 80 },
  { id: 'flash_bomb', name: 'Bomba de Luz', icon: '✨', type: 'item', chakra_restore: 0, desc: 'Cega temporariamente — interrompe Sharingan', price: 60 },
  { id: 'poison_kunai', name: 'Kunai Envenenado', icon: '☠️', type: 'item', chakra_restore: 0, desc: 'Aplica veneno leve no corte', price: 120 },
  { id: 'scroll_blank', name: 'Scroll em Branco', icon: '📋', type: 'item', chakra_restore: 0, desc: 'Para selos, contratos e jutsu gravados', price: 100 },
  { id: 'scroll_seal', name: 'Scroll de Selamento', icon: '📜', type: 'item', chakra_restore: 0, desc: 'Fūinjutsu pré-gravado — aprisiona objectos ou chakra', price: 250 },
  // EQUIPAMENTO
  { id: 'flak_jacket', name: 'Colete Jōnin', icon: '🦺', type: 'equipamento', chakra_restore: 0, desc: 'Protecção física padrão Jōnin', price: 800 },
  { id: 'anbu_vest', name: 'Colete ANBU', icon: '🛡️', type: 'equipamento', chakra_restore: 0, desc: 'Protecção reforçada — ANBU standard', price: 1500 },
  { id: 'mask_anbu', name: 'Máscara ANBU', icon: '🎭', type: 'equipamento', chakra_restore: 0, desc: 'Máscara de identidade ANBU', price: 500 },
  { id: 'ninja_cape', name: 'Capa Ninja', icon: '🧥', type: 'equipamento', chakra_restore: 0, desc: 'Capa padrão — resistente ao clima', price: 200 },
  { id: 'ninja_sandals', name: 'Sandálias Ninja', icon: '👟', type: 'equipamento', chakra_restore: 0, desc: 'Calçado ninja — silencioso e ágil', price: 150 },
  { id: 'storage_scroll', name: 'Scroll de Armazenamento', icon: '🗃️', type: 'equipamento', chakra_restore: 0, desc: 'Guarda equipamento via Fūinjutsu', price: 400 },
  // CONSUMÍVEIS — MÉDICOS
  { id: 'chakra_pill', name: 'Pílula de Chakra', icon: '💊', type: 'consumivel', chakra_restore: 100, desc: '+100 chakra — estimulante médico', price: 150 },
  { id: 'chakra_scroll_c', name: 'Scroll de Chakra', icon: '📜', type: 'consumivel', chakra_restore: 250, desc: '+250 chakra — absorção lenta', price: 350 },
  { id: 'antidote', name: 'Antídoto', icon: '🧪', type: 'consumivel', chakra_restore: 0, desc: 'Remove envenenamento leve/médio', price: 200 },
  { id: 'bandage', name: 'Ligadura Ninja', icon: '🩹', type: 'consumivel', chakra_restore: 0, desc: 'Estanca sangramento activo', price: 50 },
  { id: 'soldier_pill', name: 'Pílula Soldier', icon: '🔴', type: 'consumivel', chakra_restore: 150, desc: '+150 chakra — efeito rápido, cansaço depois', price: 180 },
  // CONSUMÍVEIS — COMIDA
  { id: 'ramen', name: 'Ramen', icon: '🍜', type: 'comida', chakra_restore: 40, desc: '+40 chakra — o favorito de Konoha', price: 35 },
  { id: 'onigiri', name: 'Onigiri', icon: '🍙', type: 'comida', chakra_restore: 20, desc: '+20 chakra — snack rápido de missão', price: 15 },
  { id: 'dango', name: 'Dango', icon: '🍡', type: 'comida', chakra_restore: 25, desc: '+25 chakra — doce de arroz', price: 20 },
  { id: 'bento', name: 'Bento', icon: '🍱', type: 'comida', chakra_restore: 50, desc: '+50 chakra — refeição completa', price: 45 },
  { id: 'green_tea', name: 'Chá Verde', icon: '🍵', type: 'comida', chakra_restore: 15, desc: '+15 chakra — acalma e foca', price: 10 },
  { id: 'grilled_fish', name: 'Peixe Grelhado', icon: '🐟', type: 'comida', chakra_restore: 35, desc: '+35 chakra — proteína de missão', price: 30 },
  { id: 'mochi', name: 'Mochi', icon: '🍮', type: 'comida', chakra_restore: 20, desc: '+20 chakra — bolo de arroz', price: 18 },
  { id: 'frozen_berries', name: 'Amoras Congeladas', icon: '🫐', type: 'comida', chakra_restore: 20, desc: '+20 chakra — especial Yuki', price: 25 },
  { id: 'ration', name: 'Ração de Campanha', icon: '🥫', type: 'comida', chakra_restore: 30, desc: '+30 chakra — dura semanas, sem sabor', price: 20 },
];

const INV_FILE = path.join(DATA, 'inventory.json');

function getInventory() {
  if (!fs.existsSync(INV_FILE)) {
    fs.writeJsonSync(INV_FILE, INVENTORY_DEFAULT, { spaces: 2 });
  }
  return fs.readJsonSync(INV_FILE);
}
function saveInventory(inv) { fs.writeJsonSync(INV_FILE, inv, { spaces: 2 }); }

app.get('/api/inventory', (req, res) => res.json(getInventory()));
app.get('/api/shop', (req, res) => res.json(SHOP_ITEMS));

app.post('/api/inventory/use', (req, res) => {
  try {
    const { char, item_id } = req.body; // char = 'player' | 'companion'
    const inv = getInventory();
    // Migrar inventários antigos com nomes hardcoded
    if (!inv.player && (inv.hakuro || inv.kiyomi)) {
      inv.player = inv.hakuro || [];
      inv.companion = inv.kiyomi || [];
      delete inv.hakuro; delete inv.kiyomi;
      saveInventory(inv);
    }
    const slot = (char === 'player' || char === 'companion') ? char : 'player';
    const item = (inv[slot] || []).find(i => i.id === item_id);
    if (!item || item.qty <= 0) return res.json({ success: false, reason: 'Item esgotado' });
    item.qty--;
    let chakraGained = 0;
    if (item.chakra_restore > 0) {
      const chars = read('characters');
      if (chars[slot]) {
        chars[slot].chakra = Math.min(chars[slot].chakra_max, chars[slot].chakra + item.chakra_restore);
        write('characters', chars);
        chakraGained = item.chakra_restore;
      }
    }
    saveInventory(inv);
    res.json({ success: true, item_name: item.name, chakra_gained: chakraGained, slot });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/inventory/buy', (req, res) => {
  try {
    const { char, item_id, qty } = req.body;
    const slot = (char === 'player' || char === 'companion') ? char : 'player';
    const shopItem = SHOP_ITEMS.find(i => i.id === item_id);
    if (!shopItem) return res.status(404).json({ error: 'Item não existe na loja' });
    const amount = qty || 1;
    const total = shopItem.price * amount;
    const fin = read('finance');
    if (fin.balance < total) return res.json({ success: false, reason: `Ryō insuficiente (precisa ${total}, tens ${fin.balance})` });
    fin.balance -= total;
    fin.transactions.unshift({ amount: -total, description: `Compra: ${amount}x ${shopItem.name}`, date: new Date().toISOString() });
    write('finance', fin);
    const inv = getInventory();
    if (!inv[slot]) inv[slot] = [];
    const existing = inv[slot].find(i => i.id === item_id);
    if (existing) existing.qty += amount;
    else inv[slot].push({ ...shopItem, qty: amount });
    saveInventory(inv);
    res.json({ success: true, balance: fin.balance, item: shopItem.name, qty: amount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/inventory/add_custom', (req, res) => {
  try {
    const { char, item } = req.body;
    const inv = getInventory();
    if (!inv[char]) inv[char] = [];
    const existing = inv[char].find(i => i.id === item.id || i.name === item.name);
    if (existing) existing.qty += item.qty || 1;
    else inv[char].push({ ...item, id: item.id || 'custom_' + Date.now(), qty: item.qty || 1 });
    saveInventory(inv);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/inventory/transfer', (req, res) => {
  try {
    const { from, to, item_id, qty } = req.body;
    const inv = getInventory();
    const fromItem = (inv[from] || []).find(i => i.id === item_id);
    if (!fromItem || fromItem.qty < qty) return res.json({ success: false, reason: 'Quantidade insuficiente' });
    fromItem.qty -= qty;
    if (!inv[to]) inv[to] = [];
    const toItem = inv[to].find(i => i.id === item_id);
    if (toItem) toItem.qty += qty;
    else inv[to].push({ ...fromItem, qty });
    saveInventory(inv);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// SISTEMA DE MISSÕES
// ═══════════════════════════════════════════

const FAME_POINTS = { D: 1, C: 3, B: 10, A: 25, S: 100 };
const FAME_TITLES = [
  { min: 0,   title: 'Desconhecido' },
  { min: 10,  title: 'Iniciante' },
  { min: 30,  title: 'Conhecido' },
  { min: 80,  title: 'Respeitado' },
  { min: 200, title: 'Temido' },
  { min: 500, title: 'Lenda' },
];

// Quais ranks de missão estão disponíveis com base no rank do personagem + missões feitas
function getAvailableRanks(playerRank, counts) {
  const total = Object.values(counts).reduce((a,b)=>a+b, 0);
  const rankOrder = ['Academy Student','Genin','Chūnin','Tokubetsu Jōnin','Jōnin','ANBU','Kage'];
  const idx = rankOrder.findIndex(r => playerRank && playerRank.includes(r.split(' ')[0]));
  const ranks = [];
  // Base pelo rank
  if (idx <= 1) { ranks.push('D'); if(total>=5) ranks.push('C'); }
  else if (idx === 2) { ranks.push('C','D'); if(total>=10) ranks.push('B'); }
  else if (idx === 3) { ranks.push('C','B'); if(total>=15) ranks.push('A'); }
  else if (idx >= 4) { ranks.push('B','A'); if(total>=20) ranks.push('S'); }
  // Bónus por missões feitas independente do rank
  if (total >= 8  && !ranks.includes('C')) ranks.push('C');
  if (total >= 15 && !ranks.includes('B')) ranks.push('B');
  if (total >= 30 && !ranks.includes('A')) ranks.push('A');
  if (total >= 60 && !ranks.includes('S')) ranks.push('S');
  return [...new Set(ranks)];
}

// Recompensas por rank
function rankReward(rank) {
  const base = { D: [50,150], C: [150,400], B: [400,1000], A: [1000,3000], S: [3000,8000] };
  const [min, max] = base[rank] || [50,150];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Gerar missões via IA
async function generateMissions(playerRank, counts, aldeia) {
  const availRanks = getAvailableRanks(playerRank, counts);
  // Distribuição: mais missões de rank baixo
  const distribution = [];
  availRanks.forEach(r => {
    const n = r==='D'?3 : r==='C'?2 : r==='B'?2 : r==='A'?1 : 1;
    for(let i=0;i<n;i++) distribution.push(r);
  });
  // Máximo 8 missões disponíveis
  const toGenerate = distribution.slice(0, 8);

  const prompt = `Gera ${toGenerate.length} missões ninja para uma aldeia shinobi (${aldeia||'Konoha'}).
Cada missão deve ter um rank da lista: ${toGenerate.join(', ')}.
Responde APENAS com JSON válido, sem texto extra, sem markdown:
[
  {"rank":"D","title":"Título curto","objective":"Objectivo em 1-2 frases","steps":["Passo 1","Passo 2","Passo 3"]},
  ...
]
Missões criativas e variadas — escolta, busca, eliminação, espionagem, protecção, investigação. Português Europeu.`;

  const { callAI } = require('./src/api');
  const result = await callAI('És um gerador de missões ninja. Responde APENAS com JSON válido.', [
    { role: 'user', content: prompt }
  ]);

  let missions = [];
  try {
    const clean = result.text.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    missions = parsed.map((m, i) => ({
      id: 'mission_' + Date.now() + '_' + i,
      rank: m.rank || toGenerate[i] || 'D',
      title: m.title || 'Missão',
      objective: m.objective || '',
      steps: m.steps || [],
      reward: rankReward(m.rank || toGenerate[i] || 'D'),
      completed_steps: [],
      generated_at: new Date().toISOString()
    }));
  } catch(e) {
    // Fallback se IA falhar
    missions = toGenerate.map((rank, i) => ({
      id: 'mission_' + Date.now() + '_' + i,
      rank,
      title: `Missão ${rank}-rank #${i+1}`,
      objective: `Missão de rank ${rank} — detalhes a definir em jogo`,
      steps: ['Aceitar a missão', 'Cumprir o objectivo', 'Reportar conclusão'],
      reward: rankReward(rank),
      completed_steps: [],
      generated_at: new Date().toISOString()
    }));
  }
  return missions;
}

// GET missões
app.get('/api/missions', (req, res) => {
  try { res.json(read('missions')); }
  catch(e) { res.json({ available:[], locked:[], completed:[], fame:0, fame_title:'Desconhecido', counts:{D:0,C:0,B:0,A:0,S:0}, last_generated:null, generating:false }); }
});

// Gerar novas missões (chamado manualmente ou por timer)
app.post('/api/missions/generate', async (req, res) => {
  try {
    const missions = read('missions');
    if (missions.generating) return res.json({ success: false, reason: 'Já a gerar...' });
    missions.generating = true;
    write('missions', missions);

    const chars = read('characters');
    const world = read('world');
    const playerRank = chars.player?.rank || 'Genin';
    const aldeia = world.location || 'Konoha';

    const newMissions = await generateMissions(playerRank, missions.counts || {D:0,C:0,B:0,A:0,S:0}, aldeia);
    missions.available = newMissions;
    missions.last_generated = new Date().toISOString();
    missions.generating = false;
    write('missions', missions);
    res.json({ success: true, missions: newMissions });
  } catch(e) {
    try { const m=read('missions'); m.generating=false; write('missions',m); } catch(_){}
    res.status(500).json({ error: e.message });
  }
});

// Lock em missão (máx 2)
app.post('/api/missions/lock', (req, res) => {
  try {
    const { id } = req.body;
    const missions = read('missions');
    if (missions.locked.length >= 2) return res.json({ success: false, reason: 'Máximo 2 missões activas' });
    const idx = missions.available.findIndex(m => m.id === id);
    if (idx === -1) return res.json({ success: false, reason: 'Missão não encontrada' });
    const [mission] = missions.available.splice(idx, 1);
    mission.locked_at = new Date().toISOString();
    missions.locked.push(mission);
    write('missions', missions);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Marcar passo como feito
app.post('/api/missions/step', (req, res) => {
  try {
    const { id, step } = req.body;
    const missions = read('missions');
    const mission = missions.locked.find(m => m.id === id);
    if (!mission) return res.json({ success: false, reason: 'Missão não encontrada nas activas' });
    if (!mission.completed_steps.includes(step)) mission.completed_steps.push(step);
    write('missions', missions);
    res.json({ success: true, completed_steps: mission.completed_steps });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Completar missão
app.post('/api/missions/complete', (req, res) => {
  try {
    const { id } = req.body;
    const missions = read('missions');
    const idx = missions.locked.findIndex(m => m.id === id);
    if (idx === -1) return res.json({ success: false, reason: 'Missão não encontrada nas activas' });
    const [mission] = missions.locked.splice(idx, 1);
    mission.completed_at = new Date().toISOString();
    missions.completed.push(mission);

    // Actualizar contadores e fama
    const rank = mission.rank || 'D';
    if (!missions.counts) missions.counts = {D:0,C:0,B:0,A:0,S:0};
    missions.counts[rank] = (missions.counts[rank] || 0) + 1;
    missions.fame = (missions.fame || 0) + (FAME_POINTS[rank] || 1);
    const title = [...FAME_TITLES].reverse().find(t => missions.fame >= t.min);
    missions.fame_title = title ? title.title : 'Desconhecido';

    // Dar recompensa
    const fin = read('finance');
    fin.balance += mission.reward || 0;
    fin.transactions.unshift({
      amount: mission.reward || 0,
      description: `Missão ${rank}: ${mission.title}`,
      date: new Date().toISOString()
    });
    write('finance', fin);
    write('missions', missions);

    // Gerar novas se lista disponível estiver vazia
    if (missions.available.length === 0 && missions.locked.length === 0) {
      // Trigger silencioso — gera em background
      setTimeout(async () => {
        try {
          const m = read('missions');
          if (m.available.length === 0) {
            const chars = read('characters');
            const world = read('world');
            const newM = await generateMissions(chars.player?.rank||'Genin', m.counts, world.location);
            m.available = newM;
            m.last_generated = new Date().toISOString();
            write('missions', m);
          }
        } catch(_) {}
      }, 2000);
    }

    res.json({ success: true, reward: mission.reward, fame: missions.fame, fame_title: missions.fame_title, balance: fin.balance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Abandon missão
app.post('/api/missions/abandon', (req, res) => {
  try {
    const { id } = req.body;
    const missions = read('missions');
    const idx = missions.locked.findIndex(m => m.id === id);
    if (idx === -1) return res.json({ success: false });
    missions.locked.splice(idx, 1);
    write('missions', missions);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Timer — gera novas missões a cada 30 minutos se disponível estiver vazia
setInterval(async () => {
  try {
    const missions = read('missions');
    if (missions.available.length > 0 || missions.generating) return;
    const chars = read('characters');
    const world = read('world');
    if (!chars.player) return;
    missions.generating = true;
    write('missions', missions);
    const newM = await generateMissions(chars.player.rank||'Genin', missions.counts||{D:0,C:0,B:0,A:0,S:0}, world.location);
    missions.available = newM;
    missions.last_generated = new Date().toISOString();
    missions.generating = false;
    write('missions', missions);
    console.log(`[Missions] ${newM.length} novas missões geradas automaticamente`);
  } catch(e) { console.error('[Missions] Erro no timer:', e.message); }
}, 30 * 60 * 1000); // 30 minutos



// ═══════════════════════════════════════════
// SISTEMA DE RELAÇÕES AVANÇADO
// ═══════════════════════════════════════════
const { LOCATIONS, CANON_NPCS } = require('./src/naruto_data');

// Detectar possíveis NPCs numa mensagem do narrador
function detectNPCsInText(text) {
  // Padrões de interacção — nome seguido de verbo de acção/fala
  const interactionPattern = /\b([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇ][a-záéíóúãõâêîôûàèìòùç]{2,})\b(?:\s+(?:disse|respondeu|olhou|sorriu|franziu|acenou|perguntou|murmurou|exclamou|virou|levantou|aproximou|recuou|atacou|defendeu|saltou|correu|parou|sentou|deitou|chorou|riu|suspirou|gritou|sussurrou|hesitou|avançou|recuou|apontou|abraçou|empurrou|puxou|tocou|entregou|recebeu))/gi;
  
  const found = new Set();
  let match;
  while ((match = interactionPattern.exec(text)) !== null) {
    const name = match[1];
    // Filtrar localizações, títulos e nomes genéricos
    if (!LOCATIONS.some(l => l.toLowerCase() === name.toLowerCase()) &&
        name.length > 2 && name.length < 20 &&
        !['Ele','Ela','Eles','Elas','Este','Esta','Isso','Aqui','Ali','Então','Mas','Com','Por','Para'].includes(name)) {
      found.add(name);
    }
  }
  return [...found];
}

// Verificar se NPC deve decair (X turnos sem menção)
function checkRelationDecay() {
  try {
    const relations = read('relations');
    const session = read('session');
    const currentTurn = session.turn || 0;
    let changed = false;

    for (const [name, rel] of Object.entries(relations)) {
      if (!rel.last_mentioned_turn) rel.last_mentioned_turn = currentTurn;
      const turnsSince = currentTurn - (rel.last_mentioned_turn || 0);
      
      // Decaimento: coração romântico desce após 20 turnos sem menção (se > 1 coração)
      if (rel.hearts > 1 && turnsSince > 20 && rel.type === 'romantic') {
        rel.hearts = Math.max(1, rel.hearts - 0.5);
        rel.status = getRelStatus(rel);
        changed = true;
      }
      // Inimizade: sem interacção não aumenta mas não desce automaticamente
    }
    if (changed) write('relations', relations);
  } catch(e) {}
}

function getRelStatus(rel) {
  const h = rel.hearts || 1;
  if (rel.type === 'enemy') return 'Inimigo';
  if (h >= 5) return '💍 Casamento / Vínculo Total';
  if (h >= 4) return '❤️ Intimidade';
  if (h >= 3) return '💑 Namoro';
  if (h >= 2) return '🤝 Amizade Próxima';
  if (h >= 1) return '👋 Conhecidos';
  return '❓ Desconhecido';
}

// POST — sugerir NPC detectado
app.post('/api/relations/suggest_npc', (req, res) => {
  try {
    const { name, context } = req.body;
    // Verificar se já existe
    const npcs = read('npcs');
    const relations = read('relations');
    const exists = npcs.find(n => n.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.json({ exists: true, npc: exists });
    
    // É nome canon?
    const isCanon = CANON_NPCS.some(c => c.toLowerCase() === name.toLowerCase());
    res.json({ exists: false, suggested_name: name, is_canon: isCanon, context });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST — criar NPC automaticamente com relação inicial
app.post('/api/relations/auto_create_npc', (req, res) => {
  try {
    const { name, is_canon, context } = req.body;
    const npcs = read('npcs');
    const relations = read('relations');
    
    // Criar NPC
    const npc = {
      id: 'npc_' + Date.now(),
      name,
      clan: is_canon ? '(Canon)' : '(Desconhecido)',
      rank: is_canon ? 'Desconhecido' : 'Desconhecido',
      type: 'npc',
      assoc: 'Nenhuma',
      village: 'Desconhecida',
      class_rank: 'C',
      bingo_book: false,
      notes: `Auto-criado via conversa. Contexto: "${context?.substring(0,100)||'—'}"`,
      auto_created: true
    };
    npcs.push(npc);
    write('npcs', npcs);
    
    // Relação inicial — meio coração "Conhecido"
    if (!relations[name]) {
      relations[name] = {
        hearts: 0.5,
        friendship: 0,
        enmity: 0,
        type: 'neutral',
        status: '👋 Conhecido',
        last_interaction: new Date().toISOString(),
        last_mentioned_turn: read('session').turn || 0,
        history: [`Primeiro encontro — ${new Date().toLocaleDateString('pt-PT')}`]
      };
      write('relations', relations);
    }
    
    res.json({ success: true, npc });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST — acção de relação (dar presente, conversa importante, etc.)
app.post('/api/relations/action', (req, res) => {
  try {
    const { name, action_type, note } = req.body;
    // action_type: 'gift'|'date'|'fight'|'save'|'betray'|'ignore'|'spend_time'|'enemy_action'
    const relations = read('relations');
    if (!relations[name]) return res.json({ success: false, reason: 'NPC não encontrado' });
    const rel = relations[name];
    const session = read('session');
    rel.last_mentioned_turn = session.turn || 0;
    rel.last_interaction = new Date().toISOString();
    
    let delta_hearts = 0;
    let delta_friendship = 0;
    let delta_enmity = 0;
    let message = '';

    switch(action_type) {
      case 'gift':
        // Presente — efeito depende dos corações actuais (NPCs resistem no início)
        if (rel.hearts < 2) { delta_hearts = 0.5; delta_friendship = 15; message = 'Presente aceite com alguma hesitação'; }
        else if (rel.hearts < 3) { delta_hearts = 0.5; delta_friendship = 20; message = 'Presente aceite com gratidão'; }
        else { delta_hearts = 0.3; delta_friendship = 10; message = 'Presente recebido com carinho'; }
        rel.type = rel.type === 'neutral' ? 'friendly' : rel.type;
        break;
      case 'date':
        if (rel.hearts < 1) { message = 'Demasiado cedo — ainda não se conhecem suficientemente'; break; }
        if (rel.hearts < 2) { delta_hearts = 0.5; delta_friendship = 25; message = 'Momento agradável — a relação cresce'; }
        else { delta_hearts = 0.5; delta_friendship = 30; message = 'Encontro significativo'; }
        rel.type = 'romantic';
        break;
      case 'save':
        delta_hearts = 1; delta_friendship = 40; message = 'Salvar alguém cria laços profundos';
        rel.type = rel.type === 'enemy' ? 'neutral' : (rel.hearts >= 2 ? 'romantic' : 'friendly');
        break;
      case 'fight_together':
        delta_friendship = 20; delta_hearts = 0.3; message = 'Combater lado a lado forja amizade';
        break;
      case 'betray':
        delta_hearts = -2; delta_enmity = 50; message = 'Traição — dano permanente na relação';
        rel.type = 'enemy';
        break;
      case 'enemy_action':
        delta_enmity = 25; delta_hearts = -0.5; message = 'Conflito — inimizade aumenta';
        rel.type = 'enemy';
        break;
      case 'ignore':
        if (rel.hearts > 1) { delta_hearts = -0.5; message = 'Ausência prolongada notada'; }
        break;
      case 'spend_time':
        delta_friendship = 10; message = 'Tempo passado juntos fortalece laços';
        break;
      case 'confess':
        if (rel.hearts >= 3) { delta_hearts = 1; message = 'Confissão correspondida'; rel.type = 'romantic'; }
        else { message = 'Demasiado cedo — a outra pessoa não está pronta'; }
        break;
    }

    rel.hearts = Math.max(0, Math.min(5, (rel.hearts || 0) + delta_hearts));
    rel.friendship = Math.max(0, Math.min(100, (rel.friendship || 0) + delta_friendship));
    rel.enmity = Math.max(0, Math.min(100, (rel.enmity || 0) + delta_enmity));
    rel.status = getRelStatus(rel);
    if (!rel.history) rel.history = [];
    rel.history.push(`[T${session.turn}] ${action_type}: ${note||message}`);
    if (rel.history.length > 20) rel.history = rel.history.slice(-20);
    
    write('relations', relations);
    res.json({ success: true, relation: rel, message });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Actualizar turno mencionado quando NPC aparece no chat
app.post('/api/relations/mention', (req, res) => {
  try {
    const { names } = req.body;
    const relations = read('relations');
    const session = read('session');
    names.forEach(name => {
      if (relations[name]) {
        relations[name].last_mentioned_turn = session.turn || 0;
      }
    });
    write('relations', relations);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Guardar notas de vida de um NPC
app.post('/api/relations/life_notes', (req, res) => {
  try {
    const { name, notes } = req.body;
    const relations = read('relations');
    if (!relations[name]) relations[name] = { hearts: 0.5, friendship: 0, enmity: 0, status: 'Conhecido' };
    relations[name].life_notes = notes;
    write('relations', relations);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
