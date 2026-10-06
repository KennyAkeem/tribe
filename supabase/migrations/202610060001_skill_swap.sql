alter table public.profiles
  add column if not exists teach_skills text[] not null default '{}',
  add column if not exists learn_skills text[] not null default '{}';

create index if not exists profiles_teach_skills_idx
  on public.profiles using gin (teach_skills);

create index if not exists profiles_learn_skills_idx
  on public.profiles using gin (learn_skills);

create or replace function public.normalize_skill_list(raw_skills text[])
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  with normalized as (
    select trim(lower(skill)) as skill
    from unnest(coalesce(raw_skills, array[]::text[])) as skill
    where trim(skill) <> ''
  )
  select array_agg(distinct skill order by skill)
  from normalized;
$$;

create or replace function public.get_skill_swap_matches(p_user_id uuid, p_limit integer default 8)
returns table (
  matched_user_id uuid,
  full_name text,
  username text,
  avatar_url text,
  teach_skills text[],
  learn_skills text[],
  can_teach text[],
  wants_to_learn text[],
  match_score integer
)
language sql
security definer
set search_path = ''
as $$
with current_profile as (
  select
    public.normalize_skill_list(teach_skills) as teach_skills,
    public.normalize_skill_list(learn_skills) as learn_skills
  from public.profiles
  where id = p_user_id
), match_candidates as (
  select
    p.id as matched_user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    public.normalize_skill_list(p.teach_skills) as teach_skills,
    public.normalize_skill_list(p.learn_skills) as learn_skills,
    array(
      select distinct skill
      from unnest(public.normalize_skill_list(p.teach_skills)) as skill
      where skill = any (coalesce(cp.learn_skills, array[]::text[]))
    ) as can_teach,
    array(
      select distinct skill
      from unnest(public.normalize_skill_list(p.learn_skills)) as skill
      where skill = any (coalesce(cp.teach_skills, array[]::text[]))
    ) as wants_to_learn
  from public.profiles p
  cross join current_profile cp
  where p.id <> p_user_id
    and (
      p.teach_skills && coalesce(cp.learn_skills, array[]::text[])
      or p.learn_skills && coalesce(cp.teach_skills, array[]::text[])
    )
)
select
  matched_user_id,
  full_name,
  username,
  avatar_url,
  teach_skills,
  learn_skills,
  can_teach,
  wants_to_learn,
  (cardinality(can_teach) + cardinality(wants_to_learn))::integer as match_score
from match_candidates
where cardinality(can_teach) > 0 or cardinality(wants_to_learn) > 0
order by match_score desc, full_name asc
limit greatest(p_limit, 0);
$$;

grant execute on function public.normalize_skill_list(text[]) to anon, authenticated;
grant execute on function public.get_skill_swap_matches(uuid, integer) to anon, authenticated;
