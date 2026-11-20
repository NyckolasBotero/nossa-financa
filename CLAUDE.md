# NOSSA FINANÇA — contexto do projeto

App de finanças da casa (usuário e esposa). Português do Brasil em toda a interface e nas respostas.

## Arquitetura
- Front estático (GitHub Pages, branch `main`), ES modules, sem build. `js/api.js` é a única camada HTTP.
- Banco: Google Sheets "Finanças". Backend: Apps Script em UM único arquivo `backend/Code.gs` (+ `backend/appsscript.json`).
- Sem credenciais no repositório. A URL /exec fica em `js/config.js`.
- Abas/colunas novas: acrescentar ao fim de `SCHEMA` (o backend se autoajusta, sem rodar `setup()`).

## Regras que valem sempre
- Toda mudança no backend: rodar `node tests/backend.test.mjs` e ENVIAR o `Code.gs` (e `appsscript.json` se mudou) ao usuário no chat com SendUserFile.
- Lógica pura em `js/projections.js` (testada em `tests/logic.test.mjs`). Cartão alimentação fora dos totais do banco; compra no crédito = despesa na data da compra; guardar não é despesa.
- Toda ação precisa de feedback (notificação lateral via `api.call(..., { feedback })`).
- Tudo que se cadastra deve poder ser editado e excluído direto no cartão.
- Verificação visual: `python3 tests/visual/vt.py <pasta>` (Playwright + Chrome, API simulada, dados sintéticos).
- Commits terminam com as linhas de atribuição pedidas pela sessão.

## Limites conhecidos
Backend só testado com simulações; e-mail real não testado; helper Android de notificações não escrito; iOS não lê notificações.
