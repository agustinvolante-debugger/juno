create table if not exists report_views (
  id bigint generated always as identity primary key,
  slug text not null,
  viewed_at timestamptz not null default now(),
  referrer text,
  user_agent text,
  country text,
  city text
);

create index idx_report_views_slug on report_views (slug);
create index idx_report_views_viewed_at on report_views (viewed_at desc);
