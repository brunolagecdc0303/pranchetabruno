/**
 * Refresh automático das rentabilidades (12 meses) do etfs.json.
 * -------------------------------------------------------------------
 * Roda no GitHub Actions (cron). Não tem dependências: usa o fetch nativo
 * do Node 20+. As chaves ficam em GitHub Secrets (nunca no código):
 *   - BRAPI_TOKEN       → brapi.dev (ETFs da B3). Grátis, exige cadastro.
 *   - TWELVEDATA_KEY    → twelvedata.com (ETFs US/UCITS). Grátis, exige cadastro.
 *
 * Fonte por ETF (inferida do domicílio):
 *   - Brasil  → brapi (símbolo = ticker)
 *   - EUA     → twelvedata (símbolo = ticker)
 *   - Irlanda → twelvedata SE houver "simbolo_ext" no item (ex.: "CSPX:LSE");
 *               senão pula (o site já herda a rentabilidade do índice).
 *
 * Tolerante a falhas: chave ausente ou erro de API → apenas pula aquele item,
 * mantém o valor anterior e segue. Só reescreve etfs.json se algo mudou.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../etfs.json', import.meta.url);
const BRAPI_TOKEN = process.env.BRAPI_TOKEN || '';
const TWELVEDATA_KEY = process.env.TWELVEDATA_KEY || '';

function fmtPct(n) {
  if (!isFinite(n)) return '';
  const s = (n >= 0 ? '+' : '') + n.toFixed(1);
  return s.replace('.', ',') + '%';
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'prancheta-refresh' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Retorno de 12 meses via brapi (B3).
async function ret12Brapi(ticker) {
  if (!BRAPI_TOKEN) return null;
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?range=1y&interval=1mo&token=${BRAPI_TOKEN}`;
  const d = await getJson(url);
  const res = d && d.results && d.results[0];
  const hist = res && res.historicalDataPrice;
  if (!hist || hist.length < 2) return null;
  const first = hist[0].close, last = hist[hist.length - 1].close;
  if (!first || !last) return null;
  return (last / first - 1) * 100;
}

// Retorno de 12 meses via Twelve Data (US / UCITS).
async function ret12Twelve(symbol) {
  if (!TWELVEDATA_KEY) return null;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1month&outputsize=14&apikey=${TWELVEDATA_KEY}`;
  const d = await getJson(url);
  const vals = d && d.values;
  if (!vals || vals.length < 13) return null;
  const last = parseFloat(vals[0].close);      // mais recente
  const yearAgo = parseFloat(vals[12].close);   // ~12 meses atrás
  if (!last || !yearAgo) return null;
  return (last / yearAgo - 1) * 100;
}

async function ret12For(etf) {
  const dom = (etf.domicilio || '').toLowerCase();
  try {
    if (dom.includes('brasil')) return await ret12Brapi(etf.ticker);
    if (dom.includes('eua')) return await ret12Twelve(etf.simbolo_ext || etf.ticker);
    if (dom.includes('irlanda') && etf.simbolo_ext) return await ret12Twelve(etf.simbolo_ext);
  } catch (e) {
    console.warn(`  ! ${etf.ticker}: ${e.message}`);
  }
  return null;
}

async function main() {
  if (!BRAPI_TOKEN) console.warn('BRAPI_TOKEN ausente — ETFs da B3 serão pulados.');
  if (!TWELVEDATA_KEY) console.warn('TWELVEDATA_KEY ausente — ETFs US/UCITS serão pulados.');

  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  const list = Array.isArray(doc) ? doc : (doc.etfs || []);
  let changed = 0;

  for (const etf of list) {
    if (etf.avulso) continue;
    const pct = await ret12For(etf);
    if (pct === null) continue;
    const novo = fmtPct(pct);
    if (novo && novo !== etf.retorno_12m) {
      console.log(`  ✓ ${etf.ticker}: ${etf.retorno_12m || '—'} → ${novo}`);
      etf.retorno_12m = novo;
      changed++;
    }
  }

  if (changed > 0) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (!Array.isArray(doc)) doc.data_atualizacao = hoje;
    writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
    console.log(`\nAtualizados ${changed} ETF(s). data_atualizacao = ${hoje}.`);
  } else {
    console.log('\nNada mudou.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
