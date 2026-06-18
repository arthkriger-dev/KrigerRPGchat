require('dotenv').config();

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:5001';

async function test() {
  console.log(`\n🧪 A testar KoboldAI em ${BASE_URL}\n`);

  // Teste 1: info do modelo
  try {
    const r = await fetch(`${BASE_URL}/api/v1/model`);
    const d = await r.json();
    console.log('✅ Modelo activo:', d.result || JSON.stringify(d));
  } catch(e) {
    console.log('❌ Não consegue ligar:', e.message);
    return;
  }

  // Teste 2: chat/completions com system
  console.log('\n📋 Teste chat/completions...');
  try {
    const r = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'O teu nome é NARRADORTEST. Quando te perguntarem o teu nome responde SEMPRE "Sou NARRADORTEST". Nunca digas outro nome.' },
          { role: 'user', content: 'Qual é o teu nome?' }
        ],
        max_tokens: 100,
        temperature: 0.1
      })
    });
    if (r.ok) {
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || d.choices?.[0]?.text || '(vazio)';
      console.log('Resposta:', text);
      if (text.includes('NARRADORTEST')) console.log('✅ System prompt FOI lido!');
      else console.log('❌ System prompt NÃO foi lido — modelo ignorou');
    } else {
      console.log('❌ Endpoint chat/completions falhou:', r.status, await r.text());
    }
  } catch(e) {
    console.log('❌ Erro:', e.message);
  }

  // Teste 3: generate nativo
  console.log('\n📋 Teste /api/v1/generate...');
  try {
    const r = await fetch(`${BASE_URL}/api/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '[Sistema: O teu nome é NARRADORTEST. Responde sempre com esse nome.]\n[Utilizador: Qual é o teu nome?]\n[Narrador:',
        max_length: 80,
        temperature: 0.1,
        stop_sequence: ['[Utilizador:']
      })
    });
    if (r.ok) {
      const d = await r.json();
      const text = d.results?.[0]?.text || '(vazio)';
      console.log('Resposta:', text);
      if (text.includes('NARRADORTEST')) console.log('✅ Generate COM system funciona!');
      else console.log('⚠️  Generate respondeu mas ignorou o nome');
    } else {
      console.log('❌ Endpoint generate falhou:', r.status);
    }
  } catch(e) {
    console.log('❌ Erro:', e.message);
  }

  // Teste 4: que endpoints existem
  console.log('\n📋 A verificar endpoints disponíveis...');
  const endpoints = [
    '/api/v1/model', '/api/v1/config', '/v1/models',
    '/api/extra/version', '/api/v1/info'
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${BASE_URL}${ep}`);
      console.log(`  ${r.ok ? '✅' : '⚠️ '} ${ep} → ${r.status}`);
    } catch(e) {
      console.log(`  ❌ ${ep} → erro`);
    }
  }
}

test().catch(console.error);
