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
5. Execute `setup()` e autorize (inclui permissão de enviar e-mail, usada nos códigos). Ele cria as abas (incluindo **Acessos**), categorias padrão e a pasta no Drive.
5b. **Primeiro acesso:** abra o site, toque em **Criar conta** e cadastre nome, **o Gmail dono da planilha** e senha. Chega um código de 6 dígitos no e-mail; ao confirmar, essa conta vira **administradora** e já entra. As demais pessoas também usam **Criar conta**, mas ficam pendentes até você aprovar em *Configurações → Usuários e aprovações* (ou na planilha: menu Finanças → Gerenciar usuários).
5c. **Esqueci a senha:** na tela de entrada, o app envia um código para o e-mail cadastrado e permite definir nova senha (derruba as sessões abertas). 8 senhas erradas bloqueiam o login por 15 min.
6. **Implantar**: *Implantar → Nova implantação → App da Web*, executar como **você**, acesso **Qualquer pessoa**. Copie a URL `/exec`.
7. **GitHub Pages**: suba esta pasta para um repositório, *Settings → Pages → branch main / root*.
8. Abra o site em cada aparelho, cole a URL `/exec` (só na primeira vez) e entre com usuário e senha. Instale como app (Adicionar à tela inicial).

Depois de alterar o backend, faça **nova versão** da implantação.

## Recursos de uso

- **Paga com**: Pix, Débito e Crédito já vêm prontos; você cria outras formas em Configurações.
- **Receitas fixas** (aba Fixas → Receitas fixas): entram na projeção de entradas dos próximos meses, junto com as contas fixas.
- **Painel**: velocímetro de saúde financeira (nota 0–100 em 4 critérios) e copo da reserva que enche conforme você guarda dinheiro; cada meta também tem seu copo.
- **Menu lateral**: clique para expandir com os nomes; no celular há barra inferior. Botão de tema claro/escuro.
- **Feedback**: notificações laterais a cada ação (salvando, salvo, erro) e animação de carregamento com a logo no login.

- **Conta fixa ou variável** (aba Contas F.V): a variável (água, luz) usa a média dos meses pagos como previsão; há gráfico mês a mês com filtro por categoria no Painel e na própria aba. Excluir é direto no cartão.
- **Contracheque**: informe proventos e descontos (ou leia PDF/foto); o líquido vira receita na data em que caiu e o mês de referência é o anterior (05/10 → setembro). Dá para editar e excluir.
- **Cofre de segurança**: meta = custo de vida mensal × 6 meses (ajustável); o cofre enche conforme você guarda e mostra meses e dias de segurança.
- **Despensa**: alimentos com fardos, validade e consumo por pessoa; mostra quantos dias a comida dura e o que está vencendo.
- **Painel**: versículo do dia (ARC) e notícias de finanças do Brasil e do mundo (o Apps Script busca no Google Notícias e guarda em cache por 30 min; exige a permissão de acesso externo).
- Abas e colunas novas da planilha são criadas sozinhas pelo backend; não é preciso rodar `setup()` de novo.

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
