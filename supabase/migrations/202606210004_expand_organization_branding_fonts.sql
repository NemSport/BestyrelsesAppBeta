alter table public.organization_branding
drop constraint if exists organization_branding_font_family_check;

alter table public.organization_branding
add constraint organization_branding_font_family_check check (
  font_family is null
  or font_family in (
    'Inter',
    'System',
    'Arial',
    'Roboto',
    'Source Sans 3',
    'Ubuntu',
    'Share',
    'Montserrat',
    'Open Sans',
    'Lato',
    'Poppins',
    'Nunito',
    'Merriweather',
    'Georgia',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Times New Roman',
    'Courier New'
  )
);
