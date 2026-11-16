create or replace function public.historical_meeting_import_markup(content text)
returns text language plpgsql immutable strict security invoker set search_path = '' as $$
declare
  line text;
  body text;
  markup text := '';
  open_block text := '';
  line_type text;
begin
  foreach line in array regexp_split_to_array(content, E'\r?\n') loop
    line_type := case
      when line ~ '^##[[:blank:]]+[^[:blank:]]' then 'heading'
      when line ~ '^-[[:blank:]]+[^[:blank:]]' then 'list'
      when btrim(line) = '' then ''
      else 'paragraph'
    end;
    body := case line_type
      when 'heading' then regexp_replace(line, '^##[[:blank:]]+', '')
      when 'list' then regexp_replace(line, '^-[[:blank:]]+', '')
      else line
    end;
    body := replace(replace(replace(body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

    if open_block <> line_type then
      markup := markup || case open_block when 'list' then '</ul>' when 'paragraph' then '</p>' else '' end;
      open_block := '';
    end if;
    case line_type
      when 'heading' then markup := markup || '<h2>' || body || '</h2>';
      when 'list' then
        if open_block = '' then markup := markup || '<ul>'; end if;
        markup := markup || '<li>' || body || '</li>';
        open_block := 'list';
      when 'paragraph' then
        markup := markup || case when open_block = '' then '<p>' else '<br>' end || body;
        open_block := 'paragraph';
      else null;
    end case;
  end loop;
  return markup || case open_block when 'list' then '</ul>' when 'paragraph' then '</p>' else '' end;
end;
$$;
