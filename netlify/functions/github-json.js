const FILES = {
  cartas: 'cartas.json',
  recados: 'recados.json',
  orientacao: 'orientacao.json',
  links: 'links.json',
  dolar_ativos: 'dolar_ativos.json',
  produtos_mes: 'produtos_mes.json'
};

const PREFIX = {
  cartas: 'carta',
  recados: 'rec',
  orientacao: 'orient',
  links: 'link',
  dolar_ativos: 'dlrat',
  produtos_mes: 'pm'
};

const OWNER = process.env.GITHUB_OWNER || 'brunolagecdc0303';
const REPO = process.env.GITHUB_REPO || 'pranchetabruno';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function reply(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

function uid(prefix) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix || 'item'}_${stamp}_${rand}`;
}

function getToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

function getPin() {
  return process.env.OPS_GESTOR_PIN || process.env.PUBLISH_PIN || process.env.ADMIN_PIN || '';
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'prancheta-netlify-function'
  };
}

function contentsUrl(file) {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(file)}`;
}

async function githubRequest(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { message: text };
  }
  if (!resp.ok) {
    const message = (data && data.message) || `GitHub retornou ${resp.status}`;
    const err = new Error(message);
    err.status = resp.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function readRepoJson(file) {
  const data = await githubRequest(`${contentsUrl(file)}?ref=${encodeURIComponent(BRANCH)}`, {
    method: 'GET',
    headers: githubHeaders()
  });
  const raw = Buffer.from(String(data.content || ''), 'base64').toString('utf8');
  let parsed = [];
  try {
    parsed = JSON.parse(raw || '[]');
  } catch (error) {
    throw new Error(`${file} nao contem JSON valido.`);
  }
  return {
    sha: data.sha,
    items: Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : [])
  };
}

async function writeRepoJson(file, sha, items, message) {
  const content = Buffer.from(`${JSON.stringify(items, null, 2)}\n`, 'utf8').toString('base64');
  return githubRequest(contentsUrl(file), {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify({
      message,
      content,
      sha,
      branch: BRANCH
    })
  });
}

function buildItem(body, modulo, previous) {
  const now = new Date().toISOString();
  const source = body.item && typeof body.item === 'object' ? body.item : body;
  const drop = {
    action: 1,
    pin: 1,
    modulo: 1,
    item: 1,
    fileData: 1,
    fileMime: 1,
    removeFile: 1
  };
  const item = {};

  Object.keys(source || {}).forEach((key) => {
    if (!drop[key]) item[key] = source[key];
  });

  item.id = String(item.id || (previous && previous.id) || body.id || uid(PREFIX[modulo]));
  item.createdAt = previous && previous.createdAt ? previous.createdAt : (item.createdAt || now);
  item.updatedAt = now;

  if (modulo === 'cartas' && !item.savedAt) {
    item.savedAt = now;
  }

  return previous ? { ...previous, ...item } : item;
}

function mutateItems(items, body) {
  const modulo = String(body.modulo || '');
  const action = String(body.action || 'save');
  const id = body.id || (body.item && body.item.id);

  if (action === 'delete') {
    if (!id) throw new Error('ID obrigatorio para excluir.');
    const next = items.filter((item) => String(item.id) !== String(id));
    if (next.length === items.length) throw new Error('Registro nao encontrado para excluir.');
    return { items: next, changedId: id };
  }

  if (action === 'toggle') {
    if (!id) throw new Error('ID obrigatorio para alternar status.');
    const index = items.findIndex((item) => String(item.id) === String(id));
    if (index < 0) throw new Error('Registro nao encontrado para alternar status.');
    const next = items.slice();
    next[index] = { ...next[index], done: !next[index].done, updatedAt: new Date().toISOString() };
    return { items: next, item: next[index], changedId: id };
  }

  if (action !== 'save') {
    throw new Error('Acao invalida.');
  }

  if (modulo === 'orientacao' || modulo === 'produtos_mes') {
    const item = buildItem(body, modulo, items[0]);
    return { items: [item], item, changedId: item.id };
  }

  const sourceId = (body.item && body.item.id) || body.id;
  const index = sourceId ? items.findIndex((item) => String(item.id) === String(sourceId)) : -1;
  const previous = index >= 0 ? items[index] : null;
  const item = buildItem(body, modulo, previous);
  const next = items.slice();

  if (index >= 0) next[index] = item;
  else next.unshift(item);

  return { items: next, item, changedId: item.id };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: jsonHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return reply(405, { ok: false, error: 'Metodo nao permitido.' });
  }

  if (!getToken()) {
    return reply(500, { ok: false, error: 'GITHUB_TOKEN nao configurado no Netlify.' });
  }

  if (!getPin()) {
    return reply(500, { ok: false, error: 'OPS_GESTOR_PIN nao configurado no Netlify.' });
  }

  let body = null;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return reply(400, { ok: false, error: 'JSON invalido.' });
  }

  const modulo = String(body.modulo || '');
  const file = FILES[modulo];
  if (!file) {
    return reply(400, { ok: false, error: 'Modulo invalido.' });
  }

  if (String(body.pin || '') !== String(getPin())) {
    return reply(401, { ok: false, error: 'PIN do gestor invalido.' });
  }

  try {
    let current;
    let mutation;
    let result;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      current = await readRepoJson(file);
      mutation = mutateItems(current.items, body);

      try {
        result = await writeRepoJson(
          file,
          current.sha,
          mutation.items,
          `Atualiza ${file}: ${mutation.changedId}`
        );
        break;
      } catch (error) {
        if (error.status === 409 && attempt === 0) continue;
        throw error;
      }
    }

    return reply(200, {
      ok: true,
      id: mutation.changedId,
      item: mutation.item || null,
      commit: result && result.commit ? result.commit.html_url : ''
    });
  } catch (error) {
    return reply(error.status && error.status < 500 ? error.status : 500, {
      ok: false,
      error: error.message || 'Nao foi possivel publicar.'
    });
  }
};
