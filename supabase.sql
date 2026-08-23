-- Lumen shared-world setup. Run once in Supabase → SQL Editor.

-- Pin metadata
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lat double precision not null,
  lng double precision not null,
  video_path text not null,
  owner text not null,
  created_at timestamptz not null default now()
);

alter table public.spots enable row level security;

create policy "anyone can read spots"
  on public.spots for select using (true);

create policy "anyone can add spots"
  on public.spots for insert with check (true);

create policy "anyone can remove spots"
  on public.spots for delete using (true);

-- Public video bucket
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "anyone can upload videos"
  on storage.objects for insert
  with check (bucket_id = 'videos');

create policy "anyone can read videos"
  on storage.objects for select
  using (bucket_id = 'videos');

create policy "anyone can delete videos"
  on storage.objects for delete
  using (bucket_id = 'videos');
