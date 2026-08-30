-- Migration: Add configurable PDF header company name font sizes to organization_settings
ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS pdf_header_company_name_en_font_size numeric,
ADD COLUMN IF NOT EXISTS pdf_header_company_name_ar_font_size numeric;

COMMENT ON COLUMN public.organization_settings.pdf_header_company_name_en_font_size IS 'Configurable font size for English company name in PDF report header (default 10.5)';
COMMENT ON COLUMN public.organization_settings.pdf_header_company_name_ar_font_size IS 'Configurable font size for Arabic company name in PDF report header (default 8.5)';
