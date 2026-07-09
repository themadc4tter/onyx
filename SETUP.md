# Setup

## Supabase Database

Use the full schema when setting up a fresh Supabase project. If the base tables already exist and you only need the skill perk additions, use the upgrade section below.

The app currently uses `settlement` as the default zone. If an older database uses `town` as the `player_state.zone_id` default, existing rows will still fall back safely in code, but new setup should use `settlement`.

## Full Schema

Run this in the Supabase SQL editor for a new database:

```sql
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz default now(),

  primary key (id)
);

create table if not exists public.player_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  zone_id text not null default 'settlement',
  tile_x integer not null default 10,
  tile_y integer not null default 10,
  facing text not null default 'down',
  updated_at timestamptz not null default now(),

  primary key (user_id),
  constraint player_state_facing_check
    check (facing in ('up', 'down', 'left', 'right'))
);

create table if not exists public.player_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_index integer not null,
  item_id text not null,
  quantity integer not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, slot_index),
  constraint player_inventory_slot_index_nonnegative
    check (slot_index >= 0),
  constraint player_inventory_quantity_positive
    check (quantity > 0)
);

create table if not exists public.player_equipment (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,
  item_id text not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, slot),
  constraint player_equipment_slot_check
    check (slot in ('head', 'chest', 'legs', 'feet', 'main_hand', 'off_hand', 'ring', 'charm'))
);

create table if not exists public.player_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  total_xp integer not null default 0,
  skill_perk_points_earned integer not null default 0,
  universal_perk_points_allocated integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (user_id, skill_id),
  constraint player_skills_total_xp_nonnegative
    check (total_xp >= 0),
  constraint player_skills_skill_perk_points_earned_nonnegative
    check (skill_perk_points_earned >= 0),
  constraint player_skills_universal_perk_points_allocated_nonnegative
    check (universal_perk_points_allocated >= 0)
);

create table if not exists public.player_skill_perks (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  perk_id text not null,
  unlocked_at timestamptz not null default now(),

  primary key (user_id, skill_id, perk_id)
);

create table if not exists public.player_universal_perk_points (
  user_id uuid not null references auth.users(id) on delete cascade,
  available_points integer not null default 0,
  lifetime_points_earned integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (user_id),
  constraint player_universal_perk_points_available_nonnegative
    check (available_points >= 0),
  constraint player_universal_perk_points_lifetime_nonnegative
    check (lifetime_points_earned >= 0)
);

create table if not exists public.player_perk_point_grants (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text null,
  point_type text not null,
  points integer not null,
  source text not null,
  source_ref text null,
  granted_at timestamptz not null default now(),

  primary key (id),
  constraint player_perk_point_grants_point_type_check
    check (point_type in ('skill', 'universal')),
  constraint player_perk_point_grants_points_positive
    check (points > 0)
);

create unique index if not exists player_perk_point_grants_source_ref_key
  on public.player_perk_point_grants (user_id, source_ref)
  where source_ref is not null;
```

## Skill Perks Upgrade

Run this against an existing database that already has `profiles`, `player_state`, `player_inventory`, `player_equipment`, and `player_skills`.

```sql
create extension if not exists pgcrypto;

alter table public.player_skills
  add column if not exists skill_perk_points_earned integer not null default 0,
  add column if not exists universal_perk_points_allocated integer not null default 0;

create table if not exists public.player_skill_perks (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  perk_id text not null,
  unlocked_at timestamptz not null default now(),

  primary key (user_id, skill_id, perk_id)
);

create table if not exists public.player_universal_perk_points (
  user_id uuid not null references auth.users(id) on delete cascade,
  available_points integer not null default 0,
  lifetime_points_earned integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (user_id)
);

create table if not exists public.player_perk_point_grants (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text null,
  point_type text not null check (point_type in ('skill', 'universal')),
  points integer not null check (points > 0),
  source text not null,
  source_ref text null,
  granted_at timestamptz not null default now(),

  primary key (id)
);

create unique index if not exists player_perk_point_grants_source_ref_key
  on public.player_perk_point_grants (user_id, source_ref)
  where source_ref is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_skills_skill_perk_points_earned_nonnegative'
  ) then
    alter table public.player_skills
      add constraint player_skills_skill_perk_points_earned_nonnegative
      check (skill_perk_points_earned >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_skills_universal_perk_points_allocated_nonnegative'
  ) then
    alter table public.player_skills
      add constraint player_skills_universal_perk_points_allocated_nonnegative
      check (universal_perk_points_allocated >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_universal_perk_points_available_nonnegative'
  ) then
    alter table public.player_universal_perk_points
      add constraint player_universal_perk_points_available_nonnegative
      check (available_points >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_universal_perk_points_lifetime_nonnegative'
  ) then
    alter table public.player_universal_perk_points
      add constraint player_universal_perk_points_lifetime_nonnegative
      check (lifetime_points_earned >= 0);
  end if;
end $$;
```

## Skill Perk Tables

These columns and tables are used by the server skill progression code:

- `player_skills.skill_perk_points_earned`: skill-specific points earned from level milestones.
- `player_skills.universal_perk_points_allocated`: universal points invested into a specific skill.
- `player_skill_perks`: unlocked perk IDs per player and skill.
- `player_universal_perk_points`: global universal perk point balance.
- `player_perk_point_grants`: future audit/idempotency table for rare-event point grants.
