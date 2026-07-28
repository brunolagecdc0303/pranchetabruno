# Como adicionar um módulo novo à Prancheta

Guia de referência para adicionar módulo/funcionalidade ao `index.html` **sem
precisar ler o arquivo inteiro**. Use `Grep` pelos marcadores abaixo para ir
direto ao ponto — nunca `Read` o arquivo completo (tem 6000+ linhas) só para
adicionar um módulo.

## 1. Descobrir os pontos de inserção (1 grep, não leia o resto)

```
grep -n "MODULE:REGISTRY:SIDEBAR:END\|MODULE:REGISTRY:TOPBAR:END\|PRINT:HIDE-MODULES:LIST" index.html
```

Isso te dá as 3 linhas onde mexer no registro de navegação. Para achar onde
termina o último módulo (CSS/HTML/JS) e inserir o novo depois:

```
grep -n "MODULE:.*:CSS:END\|MODULE:.*:HTML:END\|MODULE:.*:JS:END" index.html
```

Pegue a **última ocorrência** de cada um (é onde o módulo mais recente termina
— insira o novo módulo logo depois, mantendo a ordem cronológica).

## 2. Os 5 lugares que todo módulo novo toca

| # | O quê | Marcador para grep | Ação |
|---|---|---|---|
| 1 | Botão na sidebar | `MODULE:REGISTRY:SIDEBAR:END` | Inserir `<button class="side-item" data-module="module-X">` **antes** desse comentário |
| 2 | Botão no topbar (mobile) | `MODULE:REGISTRY:TOPBAR:END` | Inserir `<button class="mt-item" data-module="module-X">` **antes** desse comentário |
| 3 | Esconder na impressão | `PRINT:HIDE-MODULES:LIST` | Adicionar `#module-X` na lista `.sidebar,.mod-topbar,#module-...{display:none!important}` (é uma linha só, uma lista separada por vírgula) |
| 4 | Bloco CSS do módulo | `MODULE:<ULTIMO>:CSS:END` | Inserir `/* ===== MODULE:X:CSS:START ===== */ ... /* ===== MODULE:X:CSS:END ===== */` logo depois |
| 5 | Bloco HTML do módulo | `MODULE:<ULTIMO>:HTML:END` | Inserir `<!-- MODULE:X:HTML:START --> <section class="module" id="module-X" hidden>...</section> <!-- MODULE:X:HTML:END -->` logo depois |
| 6 | Bloco JS do módulo | `MODULE:<ULTIMO>:JS:END` | Inserir `/* ===== MODULE:X:JS:START ===== */ ... /* ===== MODULE:X:JS:END ===== */` logo depois |

**Não precisa tocar em `selectModule()`** — é genérica, funciona por
`data-module` sem saber quais módulos existem (comentário no próprio código,
perto da linha ~3765).

Se o módulo tiver alguma inicialização (fetch de dados, etc.), adicione uma
chamada `initX();` na lista de boot no fim do arquivo (mesmo padrão de
`initRecados(); initOrient(); initLinks(); initEtf();`).

## 3. Funções e variáveis compartilhadas (não recriar)

Já existem no bloco `SHARED:JS` (perto da linha 2660-2830) — **reaproveitar**:

- `$(id)` — atalho para `document.getElementById(id)`
- `esc(s)` — escapa HTML (usar sempre que inserir texto de usuário/dado no DOM)
- `apsUid(prefix)` — gera id único tipo `prefix_<timestamp36>_<random>`
- `apsCopy(txt, cb)` — copia para clipboard com fallback, chama `cb()` no sucesso
- `apsRead(key, fallback)` / `apsWrite(key, value)` — localStorage com try/catch embutido
- `OPS_GESTOR_PIN` (constante `'2020'`) + `opsValidatePin(inputId, statusFn)` — trava de gestor local (não é segurança de verdade, só UI)
- `apsFetchList(modulo)` — lê um array de `<modulo>.json` na raiz do deploy (ver `APS_FILES` para o mapa modulo→arquivo)
- `apsPost(payload)` — em vez de gravar ao vivo, monta o objeto e abre `commitPanel()` com o JSON pronto pra colar/commitar (mais o upload híbrido de arquivo pro Google, se `payload.fileData` vier preenchido)
- `commitPanel(modulo, kind, data)` — abre o `<dialog class="dlg">` com o JSON e botão copiar

**Se o módulo novo só precisa de conteúdo compartilhado entre assessores**
(tipo Cartas/Recados/Links): adicione a entrada em `APS_FILES` (mapa
modulo→arquivo `.json`) e `APS_PREFIX` (prefixo do id), crie o `<modulo>.json`
vazio (`[]`) na raiz do repo, e use `apsFetchList`/`apsPost` normalmente — o
fluxo de "gera JSON pra commitar" já funciona sem código extra.

**Se o módulo é só uma calculadora local** (tipo Previdência, Comparador): não
precisa de nada de rede — só JS local, direto no bloco do módulo.

**Se o módulo é uma prateleira/catálogo com curadoria + item avulso do usuário**
(padrão do ETF): ver a seção 5 abaixo — tem um template pronto pra copiar.

## 4. CSS — variáveis e convenções

Sempre escopar CSS do módulo com `#module-X .algo{...}` (nunca solto/global) e
usar as variáveis existentes em vez de cores fixas:

```css
--ink        /* texto principal, títulos escuros */
--brass      /* destaque padrão / estado "ativo" da nav */
--teal       /* destaque secundário (usado no módulo em evidência da nav) */
--clay       /* alertas/erro */
--paper      /* fundo de card sutil */
--line       /* bordas finas */
--muted      /* texto secundário */
--good       /* sucesso (mesma cor do teal hoje) */
--f-display  /* títulos (Space Grotesk) */
--f-body     /* texto (IBM Plex Sans) */
--f-mono     /* números/código (IBM Plex Mono) */
```

Padrão de bloco: header `<header class="masthead"><div class="wrap">` (título
+ lede) seguido de `<main class="wrap" style="padding-top:26px;padding-bottom:60px">`
com o conteúdo. Ver qualquer módulo existente como referência visual sem
precisar ler o CSS inteiro — basta abrir o navegador e inspecionar.

## 5. Template: módulo "prateleira" (catálogo + item avulso do usuário)

Esse é o padrão usado no módulo ETF: dados curados vêm de um `.json` na raiz
(fonte compartilhada, editada por commit) + o usuário pode adicionar itens
"seus" que ficam só no navegador dele (localStorage), sem precisar de commit.

- **Dados curados:** `<algo>.json` na raiz do repo, `{ data_atualizacao, items: [...] }`
- **JS:** três arrays — `X_CURADOS` (do fetch), `X_AVULSOS` (do localStorage),
  `X_DATA = X_CURADOS.concat(X_AVULSOS)` (o que é renderizado). Função
  `rebuild()` reconstrói `X_DATA` e re-renderiza toda vez que os avulsos mudam.
- **Formulário avulso:** NÃO gera JSON pra commit — adiciona direto no array
  `X_AVULSOS`, salva com `localStorage.setItem`, re-renderiza. Cada item avulso
  tem botão "remover" que tira do array e do localStorage. Ver
  `readAvulsos()`/`writeAvulsos()`/`addAvulso()`/`removeAvulso()` no bloco
  `MODULE:ETF:JS` como referência de código completo (não precisa ler o resto
  do módulo, só essas 4 funções).
- **Refresh automático de dados vindos de API externa:** ver
  `.github/workflows/refresh-etfs.yml` + `scripts/refresh-etfs.mjs` — cron do
  GitHub Actions que atualiza o `.json` e commita sozinho. Reaproveitável pra
  qualquer módulo que precise de dado externo atualizado periodicamente.

## 6. Checklist rápido pra passar pra mim (ou pro Claude Code futuro)

Ao pedir um módulo novo, já adianta:
1. Nome do módulo e onde ele entra na navegação (é curadoria/conteúdo
   compartilhado? calculadora local? prateleira com item do usuário?)
2. Se precisa de dado compartilhado entre assessores → qual `.json` ele lê/edita
3. Se precisa de upload de arquivo → confirma que continua no Google (híbrido)
   ou se não precisa
4. Cor de destaque, se for o caso (hoje só o Guia usa `--teal` como destaque
   de nav; os demais usam o `--brass` padrão do estado "ativo")

Com isso, a implementação usa só os 6 pontos da seção 2 + grep pelos
marcadores — sem reler o arquivo inteiro.
