-- DFC Scale: funcionários com acesso por empresa (leitor ou editor) + cercas de acesso.
--
-- Papéis:
--   profiles.role = 'admin'          -> administrador do ClinicScale (dono do site)
--   empresa_membros.role = 'admin'   -> titular da empresa (aluno, dono)
--   empresa_membros.role = 'membro'  -> funcionário do titular
--   empresa_membros.permissao (nova) -> 'editor' (consulta e altera) ou 'leitor' (só consulta)
--
-- Princípios (banco compartilhado com o PainelGestaa e o LabControl):
--   * só ACRESCENTA objetos: nenhuma política, função ou coluna existente é alterada
--     ou removida (exceto o padrão de empresa_membros.role, de 'admin' para 'membro');
--   * todos os vínculos atuais ficam 'editor', então titulares, funcionários atuais e
--     administradores continuam com o mesmo acesso de hoje nos três apps;
--   * as "cercas" são políticas RESTRITIVAS: valem junto (AND) com as permissivas que já
--     existem e só cortam o que não deveria acontecer:
--       - ler lançamentos de empresas de que o usuário não participa;
--       - alterar dados da empresa sem ser titular, editor ou administrador;
--       - criar ou apagar vínculos de empresa pelo navegador (agora só pelo servidor).
--   * reverter: bloco "Para desfazer" no fim do arquivo.

-- ── 1) Permissão por vínculo ────────────────────────────────────────────────
alter table public.empresa_membros
  add column if not exists permissao text not null default 'editor';

alter table public.empresa_membros
  drop constraint if exists empresa_membros_permissao_check;
alter table public.empresa_membros
  add constraint empresa_membros_permissao_check check (permissao in ('leitor', 'editor'));

-- Titular sempre edita.
alter table public.empresa_membros
  drop constraint if exists empresa_membros_titular_editor_check;
alter table public.empresa_membros
  add constraint empresa_membros_titular_editor_check check (role <> 'admin' or permissao = 'editor');

comment on column public.empresa_membros.permissao is
  'DFC Scale: leitor = só consulta os dados da empresa; editor = consulta e altera. Titulares (role admin) sempre editam.';

-- Um vínculo criado sem papel explícito nunca vira titular por engano.
alter table public.empresa_membros alter column role set default 'membro';

-- ── 2) Empresas do usuário logado (usadas nas cercas) ───────────────────────
-- Visíveis: titular, funcionário (leitor ou editor) ou criador.
create or replace function public.dfc_empresas_visiveis()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select em.empresa_id
    from public.empresa_membros em
   where em.user_id = (select auth.uid())
  union
  select e.id
    from public.empresas e
   where e.created_by = (select auth.uid());
$$;

-- Editáveis: titular, funcionário editor ou criador.
create or replace function public.dfc_empresas_editaveis()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select em.empresa_id
    from public.empresa_membros em
   where em.user_id = (select auth.uid())
     and (em.role = 'admin' or em.permissao = 'editor')
  union
  select e.id
    from public.empresas e
   where e.created_by = (select auth.uid());
$$;

revoke all on function public.dfc_empresas_visiveis() from public, anon;
revoke all on function public.dfc_empresas_editaveis() from public, anon;
grant execute on function public.dfc_empresas_visiveis() to authenticated, service_role;
grant execute on function public.dfc_empresas_editaveis() to authenticated, service_role;

-- ── 3) Cercas em dre_lancamentos ────────────────────────────────────────────
-- Administrador do sistema: tudo. Demais: só empresas visíveis (leitura) ou editáveis
-- (escrita). Linhas pessoais antigas sem empresa (hoje não há nenhuma) seguem do autor.
drop policy if exists "Cerca DFC: ler lancamentos" on public.dre_lancamentos;
create policy "Cerca DFC: ler lancamentos" on public.dre_lancamentos
  as restrictive for select to authenticated
  using (
    (select public.is_admin())
    or empresa_id in (select public.dfc_empresas_visiveis())
    or (empresa_id is null and user_id = (select auth.uid()))
  );

drop policy if exists "Cerca DFC: incluir lancamentos" on public.dre_lancamentos;
create policy "Cerca DFC: incluir lancamentos" on public.dre_lancamentos
  as restrictive for insert to authenticated
  with check (
    (select public.is_admin())
    or empresa_id in (select public.dfc_empresas_editaveis())
    or (empresa_id is null and user_id = (select auth.uid()))
  );

drop policy if exists "Cerca DFC: alterar lancamentos" on public.dre_lancamentos;
create policy "Cerca DFC: alterar lancamentos" on public.dre_lancamentos
  as restrictive for update to authenticated
  using (
    (select public.is_admin())
    or empresa_id in (select public.dfc_empresas_editaveis())
    or (empresa_id is null and user_id = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or empresa_id in (select public.dfc_empresas_editaveis())
    or (empresa_id is null and user_id = (select auth.uid()))
  );

drop policy if exists "Cerca DFC: excluir lancamentos" on public.dre_lancamentos;
create policy "Cerca DFC: excluir lancamentos" on public.dre_lancamentos
  as restrictive for delete to authenticated
  using (
    (select public.is_admin())
    or empresa_id in (select public.dfc_empresas_editaveis())
    or (empresa_id is null and user_id = (select auth.uid()))
  );

-- ── 4) Cercas em dre_classificacao_historico (escrita; a leitura já é por vínculo) ──
drop policy if exists "Cerca DFC: incluir historico" on public.dre_classificacao_historico;
create policy "Cerca DFC: incluir historico" on public.dre_classificacao_historico
  as restrictive for insert to authenticated
  with check ((select public.is_admin()) or empresa_id in (select public.dfc_empresas_editaveis()));

drop policy if exists "Cerca DFC: alterar historico" on public.dre_classificacao_historico;
create policy "Cerca DFC: alterar historico" on public.dre_classificacao_historico
  as restrictive for update to authenticated
  using ((select public.is_admin()) or empresa_id in (select public.dfc_empresas_editaveis()))
  with check ((select public.is_admin()) or empresa_id in (select public.dfc_empresas_editaveis()));

drop policy if exists "Cerca DFC: excluir historico" on public.dre_classificacao_historico;
create policy "Cerca DFC: excluir historico" on public.dre_classificacao_historico
  as restrictive for delete to authenticated
  using ((select public.is_admin()) or empresa_id in (select public.dfc_empresas_editaveis()));

-- ── 5) Cercas em empresa_membros: vínculos só pelo servidor ─────────────────
-- Nenhum app grava vínculos pelo navegador: o do criador vem do gatilho
-- fn_auto_vincular_criador e os de funcionários vêm de funções do servidor
-- (SECURITY DEFINER e service role), que não passam por estas políticas.
drop policy if exists "Cerca DFC: vinculos so pelo servidor (incluir)" on public.empresa_membros;
create policy "Cerca DFC: vinculos so pelo servidor (incluir)" on public.empresa_membros
  as restrictive for insert to authenticated
  with check (false);

drop policy if exists "Cerca DFC: vinculos so pelo servidor (excluir)" on public.empresa_membros;
create policy "Cerca DFC: vinculos so pelo servidor (excluir)" on public.empresa_membros
  as restrictive for delete to authenticated
  using (false);

-- ── 6) Funções da área Funcionários ─────────────────────────────────────────
-- Confere a lista de acessos [{empresa_id, permissao}] e se todas as empresas são do
-- usuário logado (titular, empresa ativa). Devolve a lista normalizada.
create or replace function public.dfc_validar_acessos(p_acessos jsonb)
returns table (empresa_id uuid, permissao text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_empresa uuid;
  v_permissao text;
  v_vistas uuid[] := array[]::uuid[];
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;
  if p_acessos is null or jsonb_typeof(p_acessos) <> 'array' then
    raise exception 'Lista de acessos inválida.';
  end if;
  if jsonb_array_length(p_acessos) > 200 then
    raise exception 'Lista de acessos grande demais.';
  end if;

  for v_item in select value from jsonb_array_elements(p_acessos) loop
    begin
      v_empresa := (v_item ->> 'empresa_id')::uuid;
    exception when others then
      raise exception 'Empresa inválida.';
    end;
    v_permissao := v_item ->> 'permissao';

    if v_empresa is null then
      raise exception 'Empresa inválida.';
    end if;
    if v_permissao is null or v_permissao not in ('leitor', 'editor') then
      raise exception 'Permissão inválida: use leitor ou editor.';
    end if;
    if v_empresa = any(v_vistas) then
      raise exception 'Empresa repetida na lista.';
    end if;
    if not exists (
      select 1
        from public.empresa_membros dono
        join public.empresas e on e.id = dono.empresa_id and e.ativo
       where dono.empresa_id = v_empresa
         and dono.user_id = v_uid
         and dono.role = 'admin'
    ) then
      raise exception 'Você só pode liberar acesso às empresas de que é titular.';
    end if;

    v_vistas := v_vistas || v_empresa;
    empresa_id := v_empresa;
    permissao := v_permissao;
    return next;
  end loop;
end;
$$;

revoke all on function public.dfc_validar_acessos(jsonb) from public, anon;
grant execute on function public.dfc_validar_acessos(jsonb) to authenticated;

-- Funcionários do titular logado: uma linha por (funcionário, empresa).
-- O e-mail vem do login (auth.users), que o próprio usuário não consegue trocar sozinho.
create or replace function public.dfc_listar_funcionarios()
returns table (
  user_id uuid,
  nome text,
  email text,
  pendente boolean,
  convidado_em timestamptz,
  empresa_id uuid,
  empresa_nome text,
  permissao text,
  vinculado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;

  return query
  select em.user_id,
         pr.name,
         coalesce(u.email, pr.email)::text,
         (u.last_sign_in_at is null),
         u.invited_at,
         e.id,
         e.nome,
         em.permissao,
         em.created_at
    from public.empresa_membros dono
    join public.empresas e
      on e.id = dono.empresa_id and e.ativo
    join public.empresa_membros em
      on em.empresa_id = dono.empresa_id and em.role = 'membro'
    left join public.profiles pr
      on pr.id = em.user_id
    left join auth.users u
      on u.id = em.user_id
   where dono.user_id = v_uid
     and dono.role = 'admin'
   order by lower(coalesce(nullif(trim(pr.name), ''), u.email, pr.email, '')), lower(e.nome);
end;
$$;

revoke all on function public.dfc_listar_funcionarios() from public, anon;
grant execute on function public.dfc_listar_funcionarios() to authenticated;

-- Vincula como funcionário uma conta que JÁ existe (pelo e-mail de login) às empresas
-- indicadas. Só acrescenta ou ajusta acessos; não remove os demais.
-- status: 'vinculado' ou 'nao_encontrado' (a função dfc-funcionarios então cria a conta
-- como convite e chama esta função de novo). pendente = a pessoa ainda não entrou.
create or replace function public.dfc_vincular_funcionario(p_email text, p_acessos jsonb)
returns table (status text, user_id uuid, pendente boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_alvo uuid;
  v_ultimo_acesso timestamptz;
  v_role text;
  v_empresas uuid[];
  v_permissoes text[];
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  select coalesce(array_agg(a.empresa_id), array[]::uuid[]),
         coalesce(array_agg(a.permissao), array[]::text[])
    into v_empresas, v_permissoes
    from public.dfc_validar_acessos(p_acessos) a;

  if cardinality(v_empresas) = 0 then
    raise exception 'Escolha ao menos uma empresa.';
  end if;

  select u.id, u.last_sign_in_at
    into v_alvo, v_ultimo_acesso
    from auth.users u
   where lower(u.email) = v_email
     and u.is_sso_user = false
     and u.is_anonymous = false
     and u.deleted_at is null
   limit 1;

  if v_alvo is null then
    status := 'nao_encontrado';
    user_id := null;
    pendente := null;
    return next;
    return;
  end if;

  if v_alvo = v_uid then
    raise exception 'Você não pode se adicionar como funcionário.';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_alvo;
  if v_role = 'admin' then
    raise exception 'Este e-mail é de um administrador do ClinicScale.';
  end if;

  -- Ajusta no lugar (sem apagar e recriar), para não perder as permissões do LabControl.
  insert into public.empresa_membros (empresa_id, user_id, role, permissao)
  select a.empresa_id, v_alvo, 'membro', a.permissao
    from unnest(v_empresas, v_permissoes) as a(empresa_id, permissao)
  on conflict on constraint empresa_membros_empresa_id_user_id_key do update
    set permissao = excluded.permissao
    where public.empresa_membros.role = 'membro';

  status := 'vinculado';
  user_id := v_alvo;
  pendente := (v_ultimo_acesso is null);
  return next;
end;
$$;

revoke all on function public.dfc_vincular_funcionario(text, jsonb) from public, anon;
grant execute on function public.dfc_vincular_funcionario(text, jsonb) to authenticated;

-- Define exatamente os acessos de um funcionário nas empresas do titular logado:
-- ajusta no lugar os da lista, cria os novos e remove os que ficaram de fora.
-- Lista vazia = tirar o funcionário de todas as empresas do titular.
-- Nunca mexe em vínculos de titular nem em empresas de outras pessoas.
create or replace function public.dfc_definir_acessos_funcionario(p_user_id uuid, p_acessos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_empresas uuid[];
  v_permissoes text[];
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'Funcionário inválido.';
  end if;

  -- Só para quem já é funcionário deste titular (o primeiro vínculo vem do convite).
  if not exists (
    select 1
      from public.empresa_membros em
      join public.empresa_membros dono
        on dono.empresa_id = em.empresa_id
       and dono.user_id = v_uid
       and dono.role = 'admin'
     where em.user_id = p_user_id
       and em.role = 'membro'
  ) then
    raise exception 'Funcionário não encontrado nas suas empresas.';
  end if;

  select coalesce(array_agg(a.empresa_id), array[]::uuid[]),
         coalesce(array_agg(a.permissao), array[]::text[])
    into v_empresas, v_permissoes
    from public.dfc_validar_acessos(coalesce(p_acessos, '[]'::jsonb)) a;

  delete from public.empresa_membros em
   using public.empresa_membros dono
   where dono.user_id = v_uid
     and dono.role = 'admin'
     and em.empresa_id = dono.empresa_id
     and em.user_id = p_user_id
     and em.role = 'membro'
     and em.empresa_id <> all(v_empresas);

  insert into public.empresa_membros (empresa_id, user_id, role, permissao)
  select a.empresa_id, p_user_id, 'membro', a.permissao
    from unnest(v_empresas, v_permissoes) as a(empresa_id, permissao)
  on conflict on constraint empresa_membros_empresa_id_user_id_key do update
    set permissao = excluded.permissao
    where public.empresa_membros.role = 'membro';
end;
$$;

revoke all on function public.dfc_definir_acessos_funcionario(uuid, jsonb) from public, anon;
grant execute on function public.dfc_definir_acessos_funcionario(uuid, jsonb) to authenticated;

-- ── Para desfazer (manual) ──────────────────────────────────────────────────
-- drop policy if exists "Cerca DFC: ler lancamentos" on public.dre_lancamentos;
-- drop policy if exists "Cerca DFC: incluir lancamentos" on public.dre_lancamentos;
-- drop policy if exists "Cerca DFC: alterar lancamentos" on public.dre_lancamentos;
-- drop policy if exists "Cerca DFC: excluir lancamentos" on public.dre_lancamentos;
-- drop policy if exists "Cerca DFC: incluir historico" on public.dre_classificacao_historico;
-- drop policy if exists "Cerca DFC: alterar historico" on public.dre_classificacao_historico;
-- drop policy if exists "Cerca DFC: excluir historico" on public.dre_classificacao_historico;
-- drop policy if exists "Cerca DFC: vinculos so pelo servidor (incluir)" on public.empresa_membros;
-- drop policy if exists "Cerca DFC: vinculos so pelo servidor (excluir)" on public.empresa_membros;
-- drop function if exists public.dfc_definir_acessos_funcionario(uuid, jsonb);
-- drop function if exists public.dfc_vincular_funcionario(text, jsonb);
-- drop function if exists public.dfc_listar_funcionarios();
-- drop function if exists public.dfc_validar_acessos(jsonb);
-- drop function if exists public.dfc_empresas_editaveis();
-- drop function if exists public.dfc_empresas_visiveis();
-- alter table public.empresa_membros alter column role set default 'admin';
-- alter table public.empresa_membros drop constraint if exists empresa_membros_titular_editor_check;
-- alter table public.empresa_membros drop constraint if exists empresa_membros_permissao_check;
-- alter table public.empresa_membros drop column if exists permissao;
