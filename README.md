# NOSSA FINANÇA

App de finanças da casa (você + esposa). Front-end estático em **GitHub Pages**, banco em **Google Sheets**, backend em **Google Apps Script**, comprovantes no **Google Drive**.

> Nenhuma credencial vai para o GitHub. Cada pessoa entra com **usuário e senha** cadastrados na planilha. A senha nunca é guardada (só hash com sal); o aparelho guarda apenas a URL e uma sessão de 30 dias.

## Estrutura
- `index.html`, `css/`, `js/`, `pages/`, `sw.js`, `manifest.json`, `assets/` — front-end (módulos ES, sem build).
- `js/api.js` — única camada HTTP. `js/store.js` — estado. `js/projections.js`, `js/insights.js` — lógica pura.
- `backend/` — `Code.gs` (arquivo único) e `appsscript.json` (colar no Apps Script).
- `tests/` — `node tests/logic.test.mjs` e `node tests/backend.test.mjs`.
- `docs/` — contrato do helper Android e limitações do iOS.

## Passo a passo
1. **Planilha**: crie uma planilha vazia no Google Sheets.
2. **Apps Script**: na planilha, *Extensões → Apps Script*. Apague o conteúdo do `Código.gs` padrão e cole todo o `backend/Code.gs`. Depois substitua o manifesto (*Configurações do projeto → mostrar appsscript.json*) pelo de `backend/appsscript.json`.
3. **Serviço avançado**: em *Serviços*, adicione **Drive API (v2)** (usada para ler contracheques).
5. Execute `setup()` e autorize. Ele cria as abas (incluindo **Acessos**), categorias padrão e a pasta no Drive. Recarregue a planilha: aparece o menu **Finanças → Gerenciar usuários**.
5b. Em **Gerenciar usuários** crie o seu acesso (o primeiro é sempre administrador) e o da sua esposa. A senha é digitada num campo mascarado e nunca aparece na planilha. Ali também dá para redefinir senha, desativar/ativar e mudar o perfil (admin/membro). Desativar ou redefinir derruba as sessões abertas da pessoa. 8 senhas erradas bloqueiam o usuário por 15 min.
6. **Implantar**: *Implantar → Nova implantação → App da Web*, executar como **você**, acesso **Qualquer pessoa**. Copie a URL `/exec`.
7. **GitHub Pages**: suba esta pasta para um repositório, *Settings → Pages → branch main / root*.
8. Abra o site em cada aparelho, cole a URL `/exec` (só na primeira vez) e entre com usuário e senha. Instale como app (Adicionar à tela inicial).

Depois de alterar o backend, faça **nova versão** da implantação.

## Regras de contabilidade
- Cartão alimentação: fora do saldo bancário/receitas/despesas, contado só no indicador de alimentação.
- Compra no crédito = despesa na data da compra; pagamento de fatura só baixa a conta.
- Guardado (poupança/metas) sai da conta mas não é despesa.
- Saldos são calculados do histórico completo (saldo inicial + lançamentos).
- Projeções 7/15/30 dias são conservadoras e avisam quando há pouco histórico.
- Exclusões são lógicas (arquivadas); há trava contra duplicidade e `AuditLog`.

## O que este projeto NÃO faz (honestidade)
- **Um site não lê notificações em segundo plano.** No Android é preciso o app auxiliar (Notification Listener) que envia para a API — contrato em `docs/android-helper.md`. O helper em si **não está incluído**.
- **iOS não permite** ler notificações de outros apps. Alternativas em `docs/ios.md` (colar texto, Atalhos).
- Leitura de contracheque e de notificações são **heurísticas**; você sempre confirma antes de salvar. Não foram testadas com contracheques reais.
- O backend foi testado com simulações, **não implantado de verdade**. Teste com dados reais em pequena escala primeiro.
- Sem fila offline: sem internet, lançamentos não são salvos.

## Segurança
- Mantenha a planilha **privada** (só você). Quem edita a planilha pode gerenciar usuários e ler os hashes (colunas ocultas em Acessos).
- Senhas: hash SHA-256 com sal e 3000 rodadas (o Apps Script não tem bcrypt); use senhas longas.
- A URL `/exec` é pública, mas sem login não entrega dados.
