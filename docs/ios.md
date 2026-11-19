# iPhone

O iOS **não permite** que um app leia notificações de outros apps. Não há como fazer isso por GitHub Pages nem por app comum. Opções reais:

1. **Colar**: em *Notificações → Colar texto*, cole a mensagem do banco; o app extrai valor e sugere categoria.
2. **Atalhos (Shortcuts)**: automação que, ao receber mensagem/e-mail de um remetente, chama "Obter conteúdo de URL" (POST) para `inbox.add` (mesmo contrato do Android). Funciona com SMS/e-mail; depende do que o iOS expõe.
3. **Automação de Transação da Carteira** (Wallet), quando disponível para seu cartão/região — verifique no seu aparelho.
4. Lançamento manual rápido pelo botão `+`.
