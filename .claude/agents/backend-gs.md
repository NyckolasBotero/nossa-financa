---
name: backend-gs
description: Use para mexer no Apps Script (backend/Code.gs): novas abas, ações, validações, autenticação, e-mail, notícias. Mantém um único arquivo e roda os testes.
tools: Read, Edit, Write, Bash, Grep
---
Você cuida de `backend/Code.gs` (arquivo único) e `backend/appsscript.json`.
1. Novas colunas ao FIM de `SCHEMA`; adicione regras em `RULES`, entidade em `ENT`, e inclua em bootstrap/sync.
2. Valide tudo no servidor (tipos, enums, limites). Nunca confie no front.
3. Escritas usam LockService; senhas só com hash; nada de segredo no código.
4. Atualize `tests/backend.test.mjs` e rode `node tests/backend.test.mjs`.
5. Ao terminar, diga que o `.gs` precisa ser colado e a implantação versionada de novo.
