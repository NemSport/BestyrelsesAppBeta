create function public.valid_pdf_template(config jsonb, organization_id uuid)
returns boolean language plpgsql immutable set search_path = '' as $$
declare orientation text; variant text; zone text; p jsonb; r jsonb; w numeric; h numeric; minimum_width numeric; minimum_height numeric; asset_path text;
begin
  if config is null then return true; end if;
  if coalesce(config->>'version','') <> '1' or coalesce(config->>'density','') not in ('compact','comfortable') then return false; end if;
  foreach orientation in array array['portrait','landscape'] loop
    w := case when orientation = 'portrait' then 210 else 297 end;
    h := case when orientation = 'portrait' then 297 else 210 end;
    if coalesce(jsonb_typeof(config->orientation->'separateContinuation'),'') <> 'boolean' then return false; end if;
    foreach variant in array array['first','continuation'] loop
      p := config->orientation->variant;
      if coalesce(p->'background'->>'kind','') not in ('none','vorbasse-marked','image') then return false; end if;
      if p->'background'->>'kind' = 'image' then
        asset_path := p->'background'->>'path';
        if asset_path is null or split_part(asset_path,'/',1) <> organization_id::text or asset_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg)$' then return false; end if;
      end if;
      foreach zone in array array['header','body','footer'] loop
        r := p->zone;
        if coalesce(jsonb_typeof(r->'x'),'') <> 'number' or coalesce(jsonb_typeof(r->'y'),'') <> 'number' or coalesce(jsonb_typeof(r->'width'),'') <> 'number' or coalesce(jsonb_typeof(r->'height'),'') <> 'number' then return false; end if;
        minimum_width := case when zone = 'body' then case when orientation = 'portrait' then 120 else 200 end else 70 end;
        minimum_height := case zone when 'body' then 70 when 'header' then 20 else 8 end;
        if (r->>'x')::numeric < 0 or (r->>'y')::numeric < 0 or (r->>'width')::numeric < minimum_width or (r->>'height')::numeric < minimum_height or (r->>'x')::numeric + (r->>'width')::numeric > w + .01 or (r->>'y')::numeric + (r->>'height')::numeric > h + .01 then return false; end if;
      end loop;
      if (p->'header'->>'y')::numeric + (p->'header'->>'height')::numeric > (p->'body'->>'y')::numeric or (p->'body'->>'y')::numeric + (p->'body'->>'height')::numeric > (p->'footer'->>'y')::numeric then return false; end if;
    end loop;
    if config->orientation->'first'->'body'->'x' <> config->orientation->'continuation'->'body'->'x' or config->orientation->'first'->'body'->'width' <> config->orientation->'continuation'->'body'->'width' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

alter table public.organization_branding add column pdf_template jsonb null
  constraint organization_branding_pdf_template_check check (public.valid_pdf_template(pdf_template, organization_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('organization-letterheads','organization-letterheads',false,5242880,array['image/png','image/jpeg'])
on conflict(id) do nothing;

create function public.letterhead_organization_id(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg)$' then return null; end if;
  return split_part(object_name,'/',1)::uuid;
exception when others then return null;
end;
$$;

create policy organization_letterheads_read on storage.objects for select to authenticated
using (bucket_id = 'organization-letterheads' and (public.is_organization_member(public.letterhead_organization_id(name)) or public.is_organization_admin(public.letterhead_organization_id(name))));
create policy organization_letterheads_insert on storage.objects for insert to authenticated
with check (bucket_id = 'organization-letterheads' and public.is_organization_admin(public.letterhead_organization_id(name)));
-- Immutable objects: replacing an image creates a new path. No client update/delete.
