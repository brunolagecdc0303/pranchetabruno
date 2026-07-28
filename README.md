# Prancheta — Central de trabalho da assessoria

Ferramenta single-file (`index.html`) usada pela equipe de assessores. Reúne calculadoras (Previdência, Isento vs. tributado, Dolarizar), conteúdo publicado pelo gestor (Cartas mensais, Recados, Orientação, Links) e a prateleira de **ETFs**.

## Arquitetura (GitHub-native, sem Google Sheets)

- **Fonte da verdade = arquivos `.json` versionados neste repositório**, lidos pela página do mesmo domínio do deploy (sem CORS, sem API).
- **Sem backend, sem token, sem variável de ambiente.** Netlify serve os arquivos estáticos e republica a cada `push`.
- **Exceção (híbrido):** o **upload de arquivos** (anexos de Recados e de ativos do Dolarizar) continua no **Google Apps Script** — ele grava o binário no Drive e devolve a URL pública, que é salva como `fileUrl` no JSON. Só o arquivo passa pelo Google; todo o texto vive no GitHub. Código em [`apps-script/upload.gs`](apps-script/upload.gs).

### Arquivos de conteúdo

| Arquivo | Módulo |
|---|---|
| `cartas.json` | Cartas mensais |
| `recados.json` | Recados importantes |
| `orientacao.json` | Orientação geral (registro único num array) |
| `links.json` | Links importantes |
| `dolar_ativos.json` | Ativos personalizados do módulo Dolarizar |
| `etfs.json` | Prateleira de ETFs (curados + avulsos) |

## Como editar conteúdo (não é ao vivo — é por commit)

A publicação **não grava mais em tempo real**. O fluxo é:

1. No próprio site, o gestor preenche o formulário do módulo (publicar carta, novo recado, novo link, cadastrar ETF avulso etc.) e clica em **gerar** — abre um painel com o **bloco JSON pronto**.
2. Copie o bloco e cole no arquivo `.json` correspondente (adicionando ao array ou substituindo o item de mesmo `id`).
3. Faça **commit + push** (pela interface web do GitHub, localmente, ou pedindo ao **Claude Code**: *"adiciona o ETF X"*, *"publica a carta de julho"*).
4. O Netlify republica automaticamente.

> Anexos: ao anexar um arquivo, ele sobe para o Google Drive e a URL já vem embutida no bloco JSON gerado — é só commitar.

## Deploy (passo a passo)

1. Crie um repositório vazio no GitHub (ex.: `prancheta`).
2. Conecte este diretório e envie:
   ```bash
   git remote add origin https://github.com/<seu-usuario>/prancheta.git
   git push -u origin main
   ```
3. No [Netlify](https://app.netlify.com): **Add new site → Import an existing project → GitHub** e escolha o repositório. O `netlify.toml` já configura tudo (`publish = "."`). Clique em **Deploy**.
4. (Híbrido/anexos) Publique o `apps-script/upload.gs` como Web App e cole a URL `/exec` em `APS_UPLOAD`, no topo do bloco de script do `index.html`. Se você **não usa anexos**, pode ignorar este passo.

## Roadmap

- **v1 (atual):** repo + `.json` + leitura + edição por commit (gerador de JSON embutido). Sem refresh automático de cotações.
- **v2:** GitHub Action agendada (cron) para atualizar retorno/PL dos ETFs via [brapi.dev](https://brapi.dev) (B3) + API global, com tokens em GitHub Secrets, commitando `etfs.json`. Opcional: Netlify Function para "Salvar" in-app.

## Notas

- **PIN do gestor** (`2020`) é trava de conveniência local, não segurança; hoje só destrava a UI de edição (que gera JSON) — não há mais gravação remota de texto.
- Itens marcados **⚠️ confirmar** em `etfs.json` aguardam validação (fact sheet / compliance). Ficam visíveis com badge até serem confirmados.
- Disclaimer no rodapé do módulo ETF: conteúdo de apoio ao assessor; não constitui recomendação; validar enquadramento tributário caso a caso.
