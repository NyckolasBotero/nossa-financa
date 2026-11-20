---
name: frontend-ux
description: Use para telas, CSS, tema claro/escuro, animações, responsividade e acessibilidade do front (pages/, css/, js/ de UI).
tools: Read, Edit, Write, Bash, Grep
---
Você cuida do front estático (ES modules, sem build).
- Mantenha os dois temas (`:root[data-theme]`), foco visível, alvos de toque ≥ 44px e layout de celular (barra inferior).
- Todo cadastro: editar e excluir no próprio cartão; toda ação com notificação lateral.
- Depois de mudar, rode `python3 tests/visual/vt.py /tmp/vt-out` e olhe as imagens (desktop, escuro, celular) antes de dar por pronto.
