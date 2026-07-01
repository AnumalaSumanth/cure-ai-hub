# Health Tips Management Module

Add a full CRUD "Health Tips" section to the authenticated dashboard, backed by a new `tips` table with RLS.

## 1. Database migration

New table `public.tips`:
- `id` uuid PK, `user_id` uuid not null (references authenticated user)
- `title` text not null, `category` text, `content` text not null
- `target_audience` text
- `status` text not null default `'Draft'` (allowed: Draft / Published / Archived, enforced by trigger)
- `tags` text[] default `'{}'`
- `notes` text
- `created_at`, `updated_at` timestamptz with auto-update trigger

Security:
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`
- Enable RLS + single policy `auth.uid() = user_id` for ALL (using + with check)
- Index on `(user_id, created_at desc)` and GIN on `tags` for search/filter perf

## 2. Routes & files

- `src/routes/_authenticated/health-tips.tsx` — list page (protected via existing `_authenticated` gate)
- `src/routes/_authenticated/health-tips.new.tsx` — create form
- `src/routes/_authenticated/health-tips.$id.tsx` — detail view
- `src/routes/_authenticated/health-tips.$id.edit.tsx` — edit form
- `src/components/dashboard/TipForm.tsx` — shared form (create + edit)
- Add "Health Tips" nav item + icon in `src/components/dashboard/DashboardLayout.tsx`
- Add a Health Tips summary card + quick action on `dashboard.tsx`

## 3. Data layer

Direct Supabase client calls (matches existing pages like `medicines.tsx`, `appointments.tsx`) wrapped in TanStack Query:
- `useQuery(['tips', filters])` for list with server-side `.ilike` search on title/content/category, `.contains` for tags, `.eq` for status/category, `.order` for sort
- `useMutation` for create/update/delete with `queryClient.invalidateQueries(['tips'])`
- Zod schema for form validation (title required, content required, status enum, tags parsed from comma-separated input)

## 4. List page UX

- Header: title + description + "Create Health Tip" button (→ `/health-tips/new`)
- Toolbar: search input (debounced), Category select, Status select (All/Draft/Published/Archived), Sort select (Newest/Oldest/Title A–Z)
- Card grid (responsive: 1 / 2 / 3 cols) showing title, status badge, category, tag chips, snippet, updated date
- Row actions: View, Edit, Delete (AlertDialog confirmation)
- Skeleton cards while loading; `EmptyState` when zero results
- Client-side pagination (12/page) once list exceeds page size

## 5. Forms (Create + Edit)

Fields: Title, Category (Input), Content (Textarea), Target Audience (Input), Tags (Input, comma-separated → string[]), Status (Select), Notes (Textarea). React Hook Form + zodResolver. Toast on success/error via existing `sonner`. Redirect to list on success. Edit form preloads via `useQuery(['tip', id])`.

## 6. Detail page

Read-only view of all fields with Edit + Delete buttons and Back link.

## 7. Consistency

Reuse shadcn `Card`, `Button`, `Input`, `Textarea`, `Select`, `Badge`, `AlertDialog`, `Skeleton`, `toast`. Match spacing/typography from existing dashboard pages. No new colors — use existing design tokens.

## Out of scope

- Rich text editor (using Textarea; can upgrade later)
- Sharing tips between users / admin publishing workflow
- File attachments on tips
