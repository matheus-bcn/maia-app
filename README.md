# M.A.I.A — app na nuvem

App (PWA) para acompanhar e comandar os agentes do M.A.I.A de qualquer celular ou computador, com login.

- Login: Supabase Auth (e-mail e senha). Cada conta só vê os próprios dados (RLS por `owner`).
- O PC dos agentes (M.A.I.A instalado → ☁️ Nuvem) envia o estado da equipe (`maia_estado`) e executa os comandos
  que o app cria (`maia_comandos`) na API local `/api/equipe/...`.
- Estrutura do banco: `schema.sql`.
- Sem segredos neste repositório: o endereço e a chave pública do Supabase são públicos por natureza; os dados só
  aparecem depois do login.
