-- Notes gain a priority (for a visual urgency tag) and a dedicated "task"
-- category, alongside the existing idea/todo/in_progress/remove/general set.

begin;

alter table public.business_notes
  add column priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high'));

alter table public.business_notes
  drop constraint business_notes_category_check;

alter table public.business_notes
  add constraint business_notes_category_check
  check (category in ('idea', 'todo', 'task', 'in_progress', 'remove', 'general'));

commit;

-- Verification:
-- insert into public.business_notes (business_id, title, category, priority)
-- values ((select id from public.businesses where slug = 'magicarte'), 'test', 'task', 'high');
-- (then delete it)
