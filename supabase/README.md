# Supabase Setup

## Local development

1. Install Supabase CLI.
2. Start local services:

   ```bash
   supabase start
   ```

3. Apply migrations and seed:

   ```bash
   supabase db reset
   ```

## Files

- `migrations/202604240001_init.sql` - initial pricing schema with RLS
- `migrations/202604240002_blueprint_core.sql` - blueprint core schema for users, professionals, geofencing, and lead waterfall
- `seed.sql` - optional local seed data
