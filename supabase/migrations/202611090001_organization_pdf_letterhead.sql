-- Existing Organization admin write and member read RLS applies unchanged.
alter table public.organization_branding
  add column pdf_letterhead text null
  constraint organization_branding_pdf_letterhead_check
  check (pdf_letterhead is null or pdf_letterhead = 'vorbasse-marked');
