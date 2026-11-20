-- Private, business-scoped actionable WhatsApp conversations. Apply separately.
begin;
create table public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  chat_key text not null check (btrim(chat_key) <> ''),
  customer_name text,
  customer_phone text,
  kind text not null default 'quote' check (kind in ('quote', 'follow_up', 'payment', 'order', 'other')),
  status text not null default 'to_quote' check (status in ('to_quote', 'sent', 'follow_up', 'won', 'lost', 'done')),
  summary text not null check (btrim(summary) <> ''),
  next_action text,
  quoted_amount numeric(12,2) check (quoted_amount >= 0),
  promised_date date,
  promise_source text,
  follow_up_date date,
  requested_at timestamptz,
  last_customer_message_at timestamptz,
  last_our_message_at timestamptz,
  awaiting_reply boolean not null default false,
  unread_count integer not null default 0 check (unread_count >= 0),
  labels text[] not null default '{}',
  reference_images text[] not null default '{}',
  order_id uuid references public.orders(id) on delete set null,
  lost_reason text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'claude')),
  last_reviewed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The legacy clients table is not defined by this migration history. Resolve its
-- actual PK type rather than assuming uuid/bigint and risking a mismatched FK.
do $$
declare client_id_type text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into strict client_id_type
  from pg_catalog.pg_attribute a where a.attrelid = 'public.clients'::regclass
    and a.attname = 'id' and not a.attisdropped;
  execute format('alter table public.whatsapp_threads add column client_id %s references public.clients(id) on delete set null', client_id_type);
end;
$$;
create table public.whatsapp_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  chats_seen integer check (chats_seen >= 0),
  threads_upserted integer check (threads_upserted >= 0),
  notes text
);
create index whatsapp_threads_business_status_idx on public.whatsapp_threads (business_id, status);
create index whatsapp_threads_business_promise_idx on public.whatsapp_threads (business_id, promised_date);
create index whatsapp_threads_business_follow_up_idx on public.whatsapp_threads (business_id, follow_up_date);
create index whatsapp_threads_client_idx on public.whatsapp_threads (client_id) where client_id is not null;
create index whatsapp_threads_order_idx on public.whatsapp_threads (order_id) where order_id is not null;
create unique index whatsapp_threads_one_open_chat_idx on public.whatsapp_threads (business_id, chat_key)
where status in ('to_quote', 'sent', 'follow_up');
create index whatsapp_reviews_business_reviewed_idx on public.whatsapp_reviews (business_id, reviewed_at desc);

create function public.enforce_whatsapp_thread_business()
returns trigger language plpgsql security definer set search_path = public as $$
declare client_business_id bigint; order_business_id bigint; image text;
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'WhatsApp thread business cannot be changed';
  end if;
  if new.client_id is not null then
    select business_id into client_business_id from public.clients where id = new.client_id for share;
    if client_business_id is distinct from new.business_id then
      raise exception 'WhatsApp client must belong to the same business';
    end if;
  end if;
  if new.order_id is not null then
    select business_id into order_business_id from public.orders where id = new.order_id for share;
    if order_business_id is distinct from new.business_id then
      raise exception 'WhatsApp order must belong to the same business';
    end if;
  end if;
  foreach image in array new.reference_images loop
    if image is null or image !~* '^https://[^[:space:]]+$' then
      raise exception 'WhatsApp reference images must use HTTPS';
    end if;
  end loop;
  new.updated_at = now();
  if tg_op = 'INSERT' then new.status_changed_at = now();
  elsif new.status is distinct from old.status then new.status_changed_at = now();
  else new.status_changed_at = old.status_changed_at;
  end if;
  return new;
end;
$$;
create trigger whatsapp_threads_enforce_business before insert or update on public.whatsapp_threads
for each row execute function public.enforce_whatsapp_thread_business();

create function public.prevent_whatsapp_business_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.business_id is distinct from old.business_id then
    if tg_table_name = 'whatsapp_reviews' then
      raise exception 'WhatsApp review business cannot be changed';
    elsif tg_table_name = 'clients' then
      if exists (select 1 from public.whatsapp_threads where client_id = old.id) then
        raise exception 'Client with WhatsApp threads cannot change business';
      end if;
    elsif exists (select 1 from public.whatsapp_threads where order_id = old.id) then
      raise exception 'Order with WhatsApp threads cannot change business';
    end if;
  end if;
  return new;
end;
$$;
create trigger whatsapp_reviews_prevent_business_change before update of business_id on public.whatsapp_reviews
for each row execute function public.prevent_whatsapp_business_change();
create trigger clients_prevent_whatsapp_business_change before update of business_id on public.clients
for each row execute function public.prevent_whatsapp_business_change();
create trigger orders_prevent_whatsapp_business_change before update of business_id on public.orders
for each row execute function public.prevent_whatsapp_business_change();

alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_reviews enable row level security;
revoke all on public.whatsapp_threads, public.whatsapp_reviews from anon;
grant select, insert, update, delete on public.whatsapp_threads, public.whatsapp_reviews to authenticated;
create policy "Members manage WhatsApp threads" on public.whatsapp_threads for all to authenticated
using (exists (select 1 from public.user_businesses ub where ub.business_id = whatsapp_threads.business_id and ub.user_id = (select auth.uid())))
with check (exists (select 1 from public.user_businesses ub where ub.business_id = whatsapp_threads.business_id and ub.user_id = (select auth.uid())));
create policy "Members manage WhatsApp reviews" on public.whatsapp_reviews for all to authenticated
using (exists (select 1 from public.user_businesses ub where ub.business_id = whatsapp_reviews.business_id and ub.user_id = (select auth.uid())))
with check (exists (select 1 from public.user_businesses ub where ub.business_id = whatsapp_reviews.business_id and ub.user_id = (select auth.uid())));
revoke execute on function public.enforce_whatsapp_thread_business() from public, anon, authenticated;
revoke execute on function public.prevent_whatsapp_business_change() from public, anon, authenticated;
commit;

/* Assistant upsert contract (SQL parameters, never interpolate chat text):
   chat_key = normalized international phone digits, or name:<lowercased name>.
   One open row per business/chat; closed rows are immutable to this upsert.
   Do not include owner-owned quoted_amount, notes, client_id, order_id in UPDATE.
   A new conversation after a closed row creates a NEW open row; it never reopens
   won/lost/done. Do not reinsert historical closed conversations every review.

insert into public.whatsapp_threads
  (business_id, chat_key, customer_name, customer_phone, kind, summary,
   next_action, promised_date, promise_source, follow_up_date, requested_at,
   last_customer_message_at, last_our_message_at, awaiting_reply, unread_count,
   labels, source, last_reviewed_at)
values
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
   $16::text[], 'claude', now())
on conflict (business_id, chat_key)
where status in ('to_quote', 'sent', 'follow_up')
do update set
  summary = excluded.summary,
  next_action = excluded.next_action,
  promised_date = excluded.promised_date,
  promise_source = excluded.promise_source,
  follow_up_date = excluded.follow_up_date,
  requested_at = coalesce(whatsapp_threads.requested_at, excluded.requested_at),
  last_customer_message_at = excluded.last_customer_message_at,
  last_our_message_at = excluded.last_our_message_at,
  awaiting_reply = excluded.awaiting_reply,
  unread_count = excluded.unread_count,
  labels = excluded.labels,
  last_reviewed_at = excluded.last_reviewed_at;

-- Once per completed review, using the same business membership:
insert into public.whatsapp_reviews (business_id, chats_seen, threads_upserted, notes)
values ($1, $2, $3, $4);
*/
