/**
 * Refresh automático das rentabilidades (12 meses) do etfs.json.
 * -------------------------------------------------------------------
 * Roda no GitHub Actions (cron). Sem dependências e SEM CHAVE: usa o
 * endpoint público de gráfico do Yahoo Finance, que funciona server-side
 * (não há CORS na Action) e cobre B3 (.SA) e mercados dos EUA.
 *
 * Símbolo por domicílio:
 *   - Brasil  → <ticker>.SA
 *   - EUA     → <ticker>
 *   - Irlanda → usa "simbolo_ext" do item (ex.: "CSPX.L"); senão pula
 *               (o site já herda a rentabilidade do índice).
 *
 * GUARDAS DE SEGURANÇA (dado ruim nunca é publicado):
 *   - exige >= 12 pontos mensais (fundo novo → pula, cai no índice);
 *   - descarta série "congelada" (primeiros meses idênticos = dado stale);
 *   - descarta retorno fora de uma banda sã (|ret| > 80%).
 * Item que não passa nas guardas mantém o valor anterior e segue.
 *
 * TWELVEDATA_KEY (opcional): se presente, é usado como fallback quando o
 * Yahoo falha para um ticker. Não é necessário.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../etfs.json', import.meta.url);
const TWELVEDATA_KEY = process.env.TWELVEDATA_KEY || '';
const UA = 'Mozilla/5.0 (compatible; prancheta-refresh)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fmtPct(n) {
  if (!isFinite(n)) return '';
  return (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%';
}

// Calcula o retorno 12m de uma série de fechamentos, com as guardas.
function ret12FromSeries(closes) {
  const c = closes.filter(x => x != null && isFinite(x));
  if (c.length < 12) return null;                 // histórico curto → fundo novo
  if (c[0] === c[3]) return null;                 // início "congelado" → dado stale
  const pct = (c[c.length - 1] / c[0] - 1) * 100;
  if (!isFinite(pct) || Math.abs(pct) > 80) return null; // fora da banda sã
  return pct;
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// Yahoo Finance (sem chave).
async function ret12Yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo`;
  const d = await getJson(url);
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
  const adj = r && r.indicators && r.indicators.adjclose && r.indicators.adjclose[0];
  const closes = (adj && adj.adjclose) || (q && q.close);
  if (!closes) return null;
  return ret12FromSeries(closes);
}

// Twelve Data (fallback opcional).
async function ret12Twelve(symbol) {
  if (!TWELVEDATA_KEY) return null;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1month&outputsize=14&apikey=${TWELVEDATA_KEY}`;
  const d = await getJson(url);
  if (!d || !d.values) return null;
  const closes = d.values.map(v => parseFloat(v.close)).reverse(); // antigo → recente
  return ret12FromSeries(closes);
}

function symbolFor(etf) {
  const dom = (etf.domicilio || '').toLowerCase();
  if (dom.includes('brasil')) return etf.simbolo_ext || (etf.ticker + '.SA');
  if (dom.includes('eua')) return etf.simbolo_ext || etf.ticker;
  if (dom.includes('irlanda')) return etf.simbolo_ext || (etf.ticker + '.L'); // UCITS na LSE
  return etf.simbolo_ext || etf.ticker;
}

async function ret12For(etf) {
  const sym = symbolFor(etf);
  if (!sym) return null;
  try {
    const y = await ret12Yahoo(sym);
    if (y !== null) return y;
  } catch (e) {
    console.warn(`  ! ${etf.ticker} (yahoo): ${e.message}`);
  }
  try {
    const t = await ret12Twelve((etf.domicilio || '').toLowerCase().includes('eua') ? etf.ticker : sym);
    if (t !== null) return t;
  } catch (e) {
    console.warn(`  ! ${etf.ticker} (twelvedata): ${e.message}`);
  }
  return null;
}

async function main() {
  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  const list = Array.isArray(doc) ? doc : (doc.etfs || []);
  let changed = 0;

  for (const etf of list) {
    if (etf.avulso) continue;
    const pct = await ret12For(etf);
    await sleep(250); // gentileza com o Yahoo
    if (pct === null) { console.log(`  · ${etf.ticker}: sem dado confiável (mantém)`); continue; }
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
