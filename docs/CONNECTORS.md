# Cure AI — Connector Business Use Cases

This document describes the third-party workspace connectors integrated with
Cure AI, why they are used, and the privacy rules that apply. Only two
connectors are enabled: **Google Drive** and **Gmail**.

Both connectors use OAuth on the Lovable connector gateway. Credentials never
touch the browser and are never logged. The application requests the minimum
scopes required for the described workflows.

## Google Drive

**Purpose:** support medical-learning workflows on documents the user has
explicitly chosen to share.

Use cases:
- Access user-selected medical study materials (PDFs, notes, lecture slides).
- Use authorized educational documents as context for the Study AI plan
  generator (e.g. prefill subject/topic from a selected file).
- Let users browse and open selected health-related documents alongside the
  in-app Medical Library, while respecting the file's original access
  permissions.

Data rules:
- Only files the user opens or references from within Cure AI are read.
- File contents are used solely to produce the requested educational output
  (summary, study plan) for that same user.
- Files are never persisted to Cure AI storage unless the user explicitly
  uploads them via the Medical Library.

## Gmail

**Purpose:** support user-authorized, health-related communication workflows.

Use cases:
- Help users work with appointment-related emails and reminders.
- Surface report notifications and healthcare communications the user has
  received (e.g. lab report ready, appointment confirmation).
- Assist with drafting non-clinical follow-up messages the user chooses to
  send from their own account.

Data rules:
- No inbox access without explicit OAuth authorization.
- Only messages the user selects or that match the user's explicit query are
  read.
- No mail is sent without a user-initiated action.

## Privacy & Safety Requirements (both connectors)

- OAuth authorization only — no password or manual API-key flows.
- Least-privilege scopes: read-only Drive and Gmail metadata/read scopes are
  preferred; write scopes are requested only when the user initiates an
  action that requires them.
- Connector credentials live in the Lovable connector gateway and are never
  exposed to the browser or to model prompts.
- Private health documents and emails are **not** used as general
  model-training data. They are passed to the AI only in the context of the
  single request that needs them, and only for that user.
- Users can disconnect either connector at any time from the Lovable
  workspace connector settings.

## AI Provider

Cure AI uses OpenAI (`gpt-4o-mini`) as the primary LLM via the server-only
helper `src/lib/ai-provider.server.ts`. If `OPENAI_API_KEY` is not set the
helper falls back to the Lovable AI Gateway (Gemini flash). All AI calls run
in `createServerFn` handlers; the key never reaches the browser.

Every AI feature (Health Assistant, Health Tips AI, Study AI) shares the
same medical-safety system prompt in `MEDICAL_SAFETY_SYSTEM`:
- educational information only, not a diagnosis
- no prescription or dosage instructions
- urgent / red-flag symptoms → advise seeking emergency care
