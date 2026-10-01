-- =========================================================
-- Plans Marketing — espace d'équipe partagé et portail client
-- (Supabase : Postgres + Auth + Realtime)
--
-- À exécuter une fois dans l'éditeur SQL du projet Supabase.
-- Rejouable sans erreur (objets créés « if not exists » ou remplacés).
--
-- Principe :
-- - Un « espace » regroupe les données d'une agence. Ses membres
--   (comptes Supabase Auth) lisent et modifient toutes ses données.
-- - Les données de l'application (clients, plans, factures, temps,
--   réglages) sont stockées document par document dans mk_donnees
--   (JSON), synchronisées en temps réel entre les membres.
-- - Le portail client n'accède JAMAIS aux tables : il passe par deux
--   fonctions (lecture d'un plan partagé, envoi d'une réponse) qui
--   exigent un jeton de partage valide.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------
create table if not exists mk_espaces (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 120),
  cree_par uuid not null default auth.uid(),
  cree_le timestamptz not null default now()
);

create table if not exists mk_membres (
  espace_id uuid not null references mk_espaces(id) on delete cascade,
  user_id uuid not null,
  email text,
  role text not null default 'membre' check (role in ('admin', 'membre')),
  ajoute_le timestamptz not null default now(),
  primary key (espace_id, user_id)
);

create table if not exists mk_invitations (
  espace_id uuid not null references mk_espaces(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'membre' check (role in ('admin', 'membre')),
  invite_le timestamptz not null default now(),
  primary key (espace_id, email)
);

create table if not exists mk_donnees (
  espace_id uuid not null references mk_espaces(id) on delete cascade,
  collection text not null check (collection in ('clients', 'plans', 'factures', 'temps', 'reglages')),
  id text not null check (char_length(id) between 1 and 64),
  doc jsonb not null,
  supprime boolean not null default false,
  maj_le timestamptz not null default now(),
  maj_par uuid default auth.uid(),
  primary key (espace_id, collection, id)
);

create table if not exists mk_partages (
  token text primary key default encode(gen_random_bytes(18), 'hex'),
  espace_id uuid not null references mk_espaces(id) on delete cascade,
  plan_id text not null,
  actif boolean not null default true,
  expire_le timestamptz not null default now() + interval '90 days',
  cree_par uuid default auth.uid(),
  cree_le timestamptz not null default now()
);

-- Réponses envoyées par le client depuis le portail (lues et appliquées par l'agence).
create table if not exists mk_retours (
  id bigserial primary key,
  token text not null references mk_partages(token) on delete cascade,
  espace_id uuid not null references mk_espaces(id) on delete cascade,
  plan_id text not null,
  type text not null check (type in ('publication', 'signature', 'commentaire')),
  cible text,
  statut text,
  commentaire text,
  nom text,
  fonction text,
  image text,
  traite boolean not null default false,
  cree_le timestamptz not null default now()
);

create index if not exists mk_donnees_espace on mk_donnees (espace_id, collection);
create index if not exists mk_retours_espace on mk_retours (espace_id, traite);

-- ---------------------------------------------------------
-- Fonctions utilitaires (security definer : évitent les
-- dépendances circulaires entre policies)
-- ---------------------------------------------------------
create or replace function mk_est_membre(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from mk_membres where espace_id = e and user_id = auth.uid());
$$;

create or replace function mk_est_admin(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from mk_membres where espace_id = e and user_id = auth.uid() and role = 'admin');
$$;

-- Le créateur d'un espace en devient automatiquement administrateur.
create or replace function mk_espace_createur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into mk_membres (espace_id, user_id, email, role)
  values (new.id, new.cree_par, lower(coalesce(auth.jwt() ->> 'email', '')), 'admin')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_mk_espace_createur on mk_espaces;
create trigger trg_mk_espace_createur after insert on mk_espaces
  for each row execute function mk_espace_createur();

-- Horodatage et auteur de chaque modification de document.
create or replace function mk_donnees_maj()
returns trigger language plpgsql as $$
begin
  new.maj_le := now();
  new.maj_par := auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_mk_donnees_maj on mk_donnees;
create trigger trg_mk_donnees_maj before insert or update on mk_donnees
  for each row execute function mk_donnees_maj();

-- Un administrateur ne peut pas retirer le dernier administrateur.
create or replace function mk_garder_un_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Suppression de l'espace entier (cascade) : rien à protéger.
  if not exists (select 1 from mk_espaces where id = old.espace_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.role = 'admin' and not exists (
    select 1 from mk_membres where espace_id = old.espace_id and role = 'admin' and user_id <> old.user_id
  ) then
    raise exception 'Un espace doit garder au moins un administrateur.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists trg_mk_garder_un_admin on mk_membres;
create trigger trg_mk_garder_un_admin before delete or update of role on mk_membres
  for each row when (old.role = 'admin') execute function mk_garder_un_admin();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table mk_espaces enable row level security;
alter table mk_membres enable row level security;
alter table mk_invitations enable row level security;
alter table mk_donnees enable row level security;
alter table mk_partages enable row level security;
alter table mk_retours enable row level security;

drop policy if exists mk_espaces_select on mk_espaces;
create policy mk_espaces_select on mk_espaces for select to authenticated using (mk_est_membre(id) or cree_par = auth.uid());
drop policy if exists mk_espaces_insert on mk_espaces;
create policy mk_espaces_insert on mk_espaces for insert to authenticated with check (cree_par = auth.uid());
drop policy if exists mk_espaces_update on mk_espaces;
create policy mk_espaces_update on mk_espaces for update to authenticated using (mk_est_admin(id)) with check (mk_est_admin(id));
drop policy if exists mk_espaces_delete on mk_espaces;
create policy mk_espaces_delete on mk_espaces for delete to authenticated using (mk_est_admin(id));

drop policy if exists mk_membres_select on mk_membres;
create policy mk_membres_select on mk_membres for select to authenticated using (mk_est_membre(espace_id));
drop policy if exists mk_membres_update on mk_membres;
create policy mk_membres_update on mk_membres for update to authenticated using (mk_est_admin(espace_id)) with check (mk_est_admin(espace_id));
drop policy if exists mk_membres_delete on mk_membres;
create policy mk_membres_delete on mk_membres for delete to authenticated using (mk_est_admin(espace_id) or user_id = auth.uid());
-- Pas de policy INSERT : on devient membre par création d'espace (trigger) ou par invitation (fonction).

drop policy if exists mk_invitations_admin on mk_invitations;
create policy mk_invitations_admin on mk_invitations for all to authenticated using (mk_est_admin(espace_id)) with check (mk_est_admin(espace_id));

drop policy if exists mk_donnees_membres on mk_donnees;
create policy mk_donnees_membres on mk_donnees for all to authenticated using (mk_est_membre(espace_id)) with check (mk_est_membre(espace_id));

drop policy if exists mk_partages_membres on mk_partages;
create policy mk_partages_membres on mk_partages for all to authenticated using (mk_est_membre(espace_id)) with check (mk_est_membre(espace_id));

drop policy if exists mk_retours_select on mk_retours;
create policy mk_retours_select on mk_retours for select to authenticated using (mk_est_membre(espace_id));
drop policy if exists mk_retours_update on mk_retours;
create policy mk_retours_update on mk_retours for update to authenticated using (mk_est_membre(espace_id)) with check (mk_est_membre(espace_id));
-- Pas d'INSERT direct : le portail passe par mk_partage_repondre().

-- ---------------------------------------------------------
-- Invitations : à la connexion, l'utilisateur rejoint les espaces
-- où son adresse email a été invitée.
-- ---------------------------------------------------------
create or replace function mk_accepter_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n integer;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  insert into mk_membres (espace_id, user_id, email, role)
    select espace_id, auth.uid(), v_email, role from mk_invitations where email = v_email
    on conflict (espace_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from mk_invitations where email = v_email;
  return n;
end;
$$;
revoke all on function mk_accepter_invitations() from public, anon;
grant execute on function mk_accepter_invitations() to authenticated;

-- ---------------------------------------------------------
-- Portail client (rôle anon) : uniquement via ces deux fonctions.
-- ---------------------------------------------------------
create or replace function mk_partage_lire(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v mk_partages;
  v_plan jsonb;
  v_reglages jsonb;
  v_client jsonb;
begin
  select * into v from mk_partages where token = p_token and actif and expire_le > now();
  if not found then return null; end if;
  select doc into v_plan from mk_donnees where espace_id = v.espace_id and collection = 'plans' and id = v.plan_id and not supprime;
  if v_plan is null then return null; end if;
  select doc into v_reglages from mk_donnees where espace_id = v.espace_id and collection = 'reglages' and id = 'reglages';
  select doc into v_client from mk_donnees where espace_id = v.espace_id and collection = 'clients' and id = v_plan ->> 'clientId';
  -- Seules les informations destinées au client sont renvoyées (pas de notes internes, résultats, temps…).
  return jsonb_build_object(
    'agence', jsonb_build_object('nom', v_reglages ->> 'nom', 'logo', v_reglages ->> 'logo', 'telephone', v_reglages ->> 'telephone', 'email', v_reglages ->> 'email', 'devise', coalesce(v_reglages ->> 'devise', 'HTG')),
    'client', jsonb_build_object('nom', v_client ->> 'nom', 'contact', v_client ->> 'contact'),
    'plan', jsonb_build_object(
      'titre', v_plan ->> 'titre', 'debut', v_plan ->> 'debut', 'fin', v_plan ->> 'fin', 'statut', v_plan ->> 'statut',
      'resume', v_plan ->> 'resume', 'objectifs', v_plan -> 'objectifs', 'actions', v_plan -> 'actions',
      'messageCle', v_plan ->> 'messageCle', 'slogan', v_plan ->> 'slogan', 'honoraires', v_plan -> 'honoraires',
      'signature', v_plan -> 'signature', 'publications', coalesce(v_plan -> 'publications', '[]'::jsonb)),
    'expire_le', v.expire_le
  );
end;
$$;

create or replace function mk_partage_repondre(
  p_token text, p_type text, p_cible text default null, p_statut text default null,
  p_commentaire text default null, p_nom text default null, p_fonction text default null, p_image text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v mk_partages;
begin
  select * into v from mk_partages where token = p_token and actif and expire_le > now();
  if not found then raise exception 'Lien invalide ou expiré.'; end if;
  if p_type not in ('publication', 'signature', 'commentaire') then raise exception 'Type de réponse invalide.'; end if;
  if p_type = 'publication' and (p_cible is null or p_statut not in ('valide', 'a_modifier')) then raise exception 'Réponse de publication invalide.'; end if;
  if p_type = 'signature' and (coalesce(p_nom, '') = '' or coalesce(p_image, '') not like 'data:image/png;base64,%') then raise exception 'Signature incomplète.'; end if;
  if char_length(coalesce(p_commentaire, '')) > 2000 or char_length(coalesce(p_image, '')) > 300000
     or char_length(coalesce(p_nom, '')) > 120 or char_length(coalesce(p_fonction, '')) > 120 then
    raise exception 'Réponse trop longue.';
  end if;
  -- Limite anti-abus : 200 réponses par lien et par jour.
  if (select count(*) from mk_retours where token = p_token and cree_le > now() - interval '1 day') >= 200 then
    raise exception 'Trop de réponses aujourd''hui pour ce lien.';
  end if;
  insert into mk_retours (token, espace_id, plan_id, type, cible, statut, commentaire, nom, fonction, image)
  values (p_token, v.espace_id, v.plan_id, p_type, p_cible, p_statut, p_commentaire, p_nom, p_fonction, p_image);
  return true;
end;
$$;

revoke all on function mk_partage_lire(text) from public;
revoke all on function mk_partage_repondre(text, text, text, text, text, text, text, text) from public;
grant execute on function mk_partage_lire(text) to anon, authenticated;
grant execute on function mk_partage_repondre(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------
-- Temps réel : les membres reçoivent les modifications des autres
-- et les réponses des clients. (Si cette instruction échoue, activez
-- la réplication de ces deux tables dans Database → Replication.)
-- ---------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table mk_donnees; exception when others then null; end;
  begin alter publication supabase_realtime add table mk_retours; exception when others then null; end;
end $$;
