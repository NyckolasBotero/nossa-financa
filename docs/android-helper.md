# Helper Android (NotificationListenerService)

Um app nativo pequeno, com `NotificationListenerService`, filtra pelos pacotes escolhidos (lista vem de `settings.get` → `monitoredApps`) e envia cada notificação ao backend. Baixo consumo: o serviço é acordado pelo sistema, sem polling; envio com WorkManager (rede + retry).

## Requisição
`POST <URL /exec>` com `Content-Type: text/plain;charset=utf-8` (evita preflight CORS):
```json
{ "action": "inbox.add", "token": "<token de sessão>",
  "payload": { "app": "Nubank", "title": "Compra aprovada", "text": "Compra de R$ 42,90 em PADARIA X",
               "postedAt": "2026-11-19T14:03:00-03:00", "device": "samsung-joao" } }
```
Resposta: `{ "ok": true, "data": {...} }` ou `{ "ok": false, "error": { "code", "message" } }`.

O backend extrai valor/entrada/saída/comerciante, sugere categoria e coloca na fila (`NotificationInbox`); a pessoa confirma/edita/rejeita no app. Rejeitadas ficam na lista reserva. Duplicatas (mesmo texto em 10 min) são ignoradas.

Outras ações úteis: `settings.get`. Guarde o token no `EncryptedSharedPreferences`; nunca no código.

## Autenticação
Faça `auth.login` uma vez (`payload: { username, password, device }`, sem `token`) e guarde o `token` de sessão devolvido (validade 30 dias; peça novo login ao receber `UNAUTHORIZED`). Crie um usuário dedicado ao helper em Gerenciar usuários e guarde a senha no `EncryptedSharedPreferences`.
