-- Optional: full YouTube description for expandable UI and link extraction
alter table digest_results add column if not exists description text;
