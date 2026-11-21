alter table public.products add column price_mode text not null default 'fixed' check (price_mode in ('fixed','from','quote'));
