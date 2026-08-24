// Adds a trigger so new Supabase Auth users are auto-confirmed on insert,
// enabling self-service sign-up without email/SMTP round-trips. Idempotent.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pg = require('pg')

const client = new pg.Client({
  host: 'db.ydhvsiixwmbxoumglpvq.supabase.co', port: 5432, user: 'postgres',
  password: process.env.SUPA_DB_PASS, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
})
await client.connect()
await client.query(`
  create or replace function public.auto_confirm_user() returns trigger as $$
  begin
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    return new;
  end; $$ language plpgsql security definer;

  drop trigger if exists trg_auto_confirm on auth.users;
  create trigger trg_auto_confirm before insert on auth.users
    for each row execute function public.auto_confirm_user();
`)
console.log('AUTO_CONFIRM_TRIGGER_INSTALLED')
await client.end()
