# Committee Memory

Phase 1 of a committee-centered SaaS application built with Next.js, TypeScript,
Tailwind, Supabase Auth, and PostgreSQL.

## Included

- Email and password authentication
- Organizations and organization membership
- Committees and committee membership
- Meetings
- Durable Agenda Items
- Scheduling one Agenda Item into multiple Meetings
- Supabase Row Level Security
- Repository and service layers
- JSON API routes and server-rendered frontend pages

AI, Task View, Annual Wheel, and Job Cards are intentionally not implemented.

## Local Setup

See the beginner-friendly
[Local Development Setup Guide](docs/local-development.md) for complete
instructions, checklists, Supabase configuration, migration deployment, and
creating the first Organization, Committee, Meeting, and Agenda Item.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```
