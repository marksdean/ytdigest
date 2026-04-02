-- Per-row read state: null = unread (show "new"), non-null = marked read
alter table digest_results add column if not exists read_at timestamptz;

create index if not exists digest_results_unread_idx
  on digest_results (read_at)
  where read_at is null;
