// src/api.js — Camada de abstracção multi-API
require('dotenv').config();

const API_TYPE = (process.env.API_TYPE || 'anthropic').toLowerCase();
const API_KEY = process.env.API_KEY || '';
const API_URL = process.env.API_URL || '';
const MODEL = process.env.MODEL || 'claude-haiku-4-5';
const TEMPERATURE = parseFloat(process.env.TEMPERATURE || '0.7');
const MAX_CONTEXT = parseInt(process.env.MAX_CONTEXT || '4096');

async function callAI(systemPrompt, messages, images = []) {
  switch (API_TYPE) {
    case 'anthropic': return callAnthropic(systemPrompt, messages, images);
    case 'kobold':    return callKobold(systemPrompt, messages);
    case 'groq':
    case 'openai':    return callOpenAICompatible(systemPrompt, messages, images);
    default: throw new Error(`API_TYPE desconhecido: ${API_TYPE}`);
  }
}

// ═══ ANTHROPIC ═══
async function callAnthropic(systemPrompt, messages, images) {
  const apiMessages = [...messages];
  if (images && images.length > 0) {
    const last = apiMessages[apiMessages.length - 1];
    apiMessages[apiMessages.length - 1] = {
      role: 'user',
      content: [
        ...images.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 }
        })),
        { type: 'text', text: typeof last.content === 'string' ? last.content : '' }
      ]
    };
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: apiMessages
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { text: data.content[0].text, tokens: data.usage?.output_tokens || 0 };
}

// ═══ KOBOLDAI ═══
// O KoboldAI tem context window limitada e formatos variados.
// Estratégia: comprimir o system prompt e usar apenas o essencial.
async function callKobold(systemPrompt, messages) {
  const baseUrl = API_URL || 'http://127.0.0.1:5001';

  // Verificar qual endpoint está disponível
  // Tentar primeiro /v1/chat/completions (OpenAI compat)
  // Se falhar, usar /api/v1/generate (formato nativo Kobold)
  
  // Comprimir system prompt para caber no context window
  // Limitar a ~2000 caracteres para deixar espaço para histórico e resposta
  const MAX_SYSTEM = 2000;
  let compressedSystem = systemPrompt;
  if (systemPrompt.length > MAX_SYSTEM) {
    // Extrair só as secções críticas
    const lines = systemPrompt.split('\n');
    const critical = [];
    let inCritical = false;
    for (const line of lines) {
      // Incluir sempre: regras, personagem, localização, relações, condições
      if (line.includes('REGRA #1') || line.includes('REGRA #2') || 
          line.includes('REGRA #3') || line.includes('NUNCA FALES') ||
          line.includes('PERSONAGEM DO JOGADOR') || line.includes('APARÊNCIA FÍSICA') ||
          line.includes('LOCALIZAÇÃO') || line.includes('CONDIÇÕES ACTIVAS') ||
          line.includes('RELACIONAMENTOS') || line.includes('MISSÕES ACTIVAS')) {
        inCritical = true;
      }
      // Parar antes dos documentos (worldbible) — demasiado grande
      if (line.includes('DOCUMENTOS DO PROJECTO')) { inCritical = false; break; }
      if (inCritical && line.trim()) critical.push(line);
    }
    compressedSystem = critical.join('\n').substring(0, MAX_SYSTEM);
    
    // Adicionar resumo do personagem se disponível
    const charStart = systemPrompt.indexOf('PERSONAGEM DO JOGADOR:');
    const charEnd = systemPrompt.indexOf('LOCALIZAÇÃO ACTUAL:');
    if (charStart > 0 && charEnd > charStart) {
      const charSection = systemPrompt.substring(charStart, charEnd).substring(0, 500);
      compressedSystem = charSection + '\n\n' + compressedSystem;
    }
  }

  // Tentar chat/completions primeiro
  try {
    const koboldMessages = [
      { role: 'system', content: compressedSystem },
      ...messages.slice(-8), // Últimas 8 mensagens para não explodir o context
    ];

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: koboldMessages,
        max_tokens: 800,
        temperature: TEMPERATURE,
        top_p: 0.9,
        repetition_penalty: 1.1,
        stop: ['\n[', '\n##']
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
      if (text) return { text, tokens: data.usage?.completion_tokens || 0 };
    }
  } catch(e) {
    console.log('[Kobold] chat/completions falhou, a tentar generate...');
  }

  // Fallback: formato nativo Kobold /api/v1/generate
  // Construir prompt como texto único (formato instruct)
  const historyText = messages.slice(-6).map(m => 
    m.role === 'user' ? `\n### Jogador:\n${m.content}` : `\n### Narrador:\n${m.content}`
  ).join('');
  
  const fullPrompt = `### Sistema:\n${compressedSystem}\n${historyText}\n### Narrador:\n`;

  const res2 = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fullPrompt,
      max_length: 800,
      temperature: TEMPERATURE,
      top_p: 0.9,
      rep_pen: 1.1,
      stop_sequence: ['### Jogador:', '### Sistema:']
    })
  });

  if (!res2.ok) throw new Error(`Kobold: ${await res2.text()}`);
  const data2 = await res2.json();
  const text2 = data2.results?.[0]?.text || '';
  return { text: text2.trim(), tokens: 0 };
}

// ═══ GROQ / OPENAI COMPATIBLE ═══
async function callOpenAICompatible(systemPrompt, messages, images) {
  const baseUrl = API_URL || 'https://api.openai.com';
  const model = MODEL || (API_TYPE === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  if (images && images.length > 0) {
    const last = apiMessages[apiMessages.length - 1];
    apiMessages[apiMessages.length - 1] = {
      role: 'user',
      content: [
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
        })),
        { type: 'text', text: typeof last.content === 'string' ? last.content : '' }
      ]
    };
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      temperature: TEMPERATURE,
      messages: apiMessages
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { text: data.choices[0].message.content, tokens: data.usage?.completion_tokens || 0 };
}

module.exports = { callAI, API_TYPE };
