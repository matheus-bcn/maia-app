-- M.A.I.A Escritório: ponte nuvem <-> PC dos agentes. Cada login só vê o que é dele (RLS por owner).
create table if not exists public.maia_runners (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null default 'PC',
  versao text,
  visto_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create table if not exists public.maia_estado (
  runner_id uuid primary key references public.maia_runners (id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.maia_comandos (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  runner_id uuid not null references public.maia_runners (id) on delete cascade,
  metodo text not null check (metodo in ('GET', 'POST')),
  caminho text not null check (caminho like '/api/equipe%' and length(caminho) < 300),
  corpo jsonb,
  situacao text not null default 'novo' check (situacao in ('novo', 'feito', 'erro')),
  http int,
  resposta jsonb,
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);
create index if not exists maia_comandos_pendentes on public.maia_comandos (runner_id, id) where situacao = 'novo';
create index if not exists maia_comandos_owner on public.maia_comandos (owner);
create index if not exists maia_comandos_runner on public.maia_comandos (runner_id);
create index if not exists maia_runners_owner on public.maia_runners (owner);
create index if not exists maia_estado_owner on public.maia_estado (owner);

alter table public.maia_runners enable row level security;
alter table public.maia_estado enable row level security;
alter table public.maia_comandos enable row level security;

create policy "maia_runners_dono" on public.maia_runners for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "maia_estado_dono" on public.maia_estado for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "maia_comandos_dono" on public.maia_comandos for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

alter publication supabase_realtime add table public.maia_estado;
