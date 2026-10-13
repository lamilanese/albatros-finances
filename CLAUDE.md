# Albatros Finances — Invoice Submission Form

## Context
Internal invoice form for **Orchestre Albatros**, replacing a Google Form ("Nouveau virement").
Single-page HTML form that submits to a Supabase backend and sends a Telegram notification.

## Database (Supabase)

### Table: `recipients`
| Column          | Type         | Notes          |
|-----------------|--------------|----------------|
| recipient_id    | uuid (PK)    | auto-generated |
| created_at      | timestamptz  | auto           |
| iban            | text         |                |
| recipient_label | text         |                |

### Table: `invoices`
| Column       | Type         | Notes                          |
|--------------|--------------|--------------------------------|
| id           | uuid (PK)    | auto-generated                 |
| created_at   | timestamptz  | auto                           |
| label        | text         | "Intitulé" — required          |
| amount       | float8       | "Montant"                      |
| recipient_id | uuid (FK)    | references recipients.recipient_id |
| due_date     | timestamp    | "Échéance"                     |
| sent         | bool         | default false                  |

### Relationship
`invoices.recipient_id` → `recipients.recipient_id` (many-to-one)

## Form Fields & Validation
1. **Intitulé** (text, required) → `invoices.label`
2. **Montant** (number, required, > 0, 2 decimal places) → `invoices.amount`
3. **Destinataire** (text, required) → `recipients.recipient_label` — autocomplete from existing recipients, allow adding new
4. **IBAN** (text, required) → `recipients.iban` — auto-filled when existing recipient selected, validated (MOD-97 check), auto-formatted with spaces
5. **Échéance** (date, required, future dates only) → `invoices.due_date`
6. **Facture** (file upload, required) → storage bucket
   - Accepted: PDF, JPEG, PNG, HEIC, HEIF, WebP, TIFF, AVIF, GIF, BMP
   - MIME: `application/pdf, application/x-pdf, image/jpeg, image/jpg, image/pjpeg, image/png, image/x-png, image/heic, image/heif, image/heic-sequence, image/heif-sequence, image/webp, image/tiff, image/avif, image/gif, image/bmp`

## UX Priorities
- Mobile-first, responsive
- Intuitive, fast to fill
- Recipient autocomplete with "add new" option

## Visual Identity (Orchestre Albatros)
- **Primary color:** golden yellow `#E8A83E` (header banner, accents)
- **Secondary color:** black (text, headings)
- **Font style:** monospace / serif mix (concert poster aesthetic)
- **Logo:** stylized "A" bird mark (top-left on website)
- **Vibe:** clean, classical music association, bold typography
- **Background:** white, card-based layout

## Architecture Plan
1. **Phase 1 — Frontend (mock mode):** standalone HTML/CSS/JS, all logic testable locally with mock submissions (console.log, localStorage)
2. **Phase 2 — Backend wiring:** connect Supabase (DB + storage bucket), Telegram bot notifications
3. Single HTML file with embedded CSS/JS (no build tools)

## Integrations (credentials TBD)
- **Supabase:** project URL, anon key
- **Storage bucket:** bucket name, accepted file types
- **Telegram:** bot token, chat ID
