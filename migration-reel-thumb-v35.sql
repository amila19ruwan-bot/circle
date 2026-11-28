-- Run once in Supabase SQL editor: lets a reel keep its chosen cover (thumbnail) image
alter table public.reels add column if not exists thumb_url text;
