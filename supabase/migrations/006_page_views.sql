create table if not exists page_views (
  id bigint generated always as identity primary key,
  path text not null,
  referrer text,
  user_agent text,
  country text,
  city text,
  viewed_at timestamptz not null default now()
);

create index idx_page_views_path on page_views (path);
create index idx_page_views_viewed_at on page_views (viewed_at desc);
