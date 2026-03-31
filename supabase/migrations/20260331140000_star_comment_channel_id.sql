-- Starred items, user notes, and stable channel linkage for filters and cleanup
alter table digest_results add column if not exists starred boolean not null default false;
alter table digest_results add column if not exists user_note text;
alter table digest_results add column if not exists channel_id text;

create index if not exists digest_results_channel_id_idx on digest_results (channel_id);
create index if not exists digest_results_starred_idx on digest_results (starred) where starred = true;
