# راه‌اندازی روی یک کامپیوتر جدید

همه‌ی کد، مایگریشن‌ها، تست‌ها، قوانین کار (`AGENTS.md`، `CLAUDE.md`، پوشه‌ی `.claude`) و اسکریپت‌های یک‌باره در Git هستند. فقط کلیدهای مخفی (`.env.local`) عمداً در Git نیستند.

## ۱. گرفتن کد

```
git clone https://github.com/Zakeri-labs/buildsight.git
cd buildsight
git checkout kian-claude
npm install
```

برای به‌روز کردن یک کامپیوتر که قبلاً clone شده:

```
git checkout kian-claude
git pull
npm install
```

## ۲. فایل `.env.local` (دستی)

این فایل کلیدهای مخفی دارد و نباید در Git باشد. یکی از این دو راه:
- از کامپیوتر قبلی کپی کنید (کنار `package.json`).
- یا مقادیر را از Vercel → Project → Settings → Environment Variables بردارید (`npx vercel env pull .env.local` هم همین کار را می‌کند).

حداقل لازم برای اجرا:
- `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`، `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (برای لینک‌های canonical و sitemap گالری)

برای بخش‌های دیگر app: `OPENAI_API_KEY` و مدل‌ها (ببینید `.env.example`)، `ZOHO_SMTP_*` و آدرس‌های فرستنده‌ی ایمیل.

اختیاری برای گالری طرح‌ها:
- `DESIGN_GALLERY_DEFAULT_SITE`: معمولاً خالی بماند؛ گالری پیش‌فرض در دیتابیس مشخص است.
- `GOOGLE_CALENDAR_CLIENT_ID`، `GOOGLE_CALENDAR_CLIENT_SECRET`، `GOOGLE_CALENDAR_REFRESH_TOKEN`، `GOOGLE_CALENDAR_ID`: بعد از اتصال حساب گوگل تقویم مشترک. بدون این‌ها رزرو کار می‌کند ولی رویداد تقویم و لینک Meet ساخته نمی‌شود.

## ۳. اجرا و تست

```
npm run dev          # http://localhost:3000
npm test             # همه‌ی تست‌ها (Vitest)
npx tsc --noEmit     # بررسی TypeScript
```

## ۴. دیتابیس

مایگریشن‌ها در `scripts/sql/NNN_*.sql` هستند و به ترتیب، دستی در Supabase SQL editor اجرا می‌شوند. فهرست و توضیح هر کدام در `CHANGELOG.md` است.

اسکریپت‌های یک‌باره‌ی مخصوص دیتابیس فعلی بنیان (نه برای سازمان‌های دیگر) در `scripts/sql/one-off/` هستند:
- `setup_bonyan_gallery_once.sql`: بعد از 083 (روشن کردن گالری، نام، واتساپ، طرح‌های نمونه)
- `setup_bonyan_booking_once.sql`: بعد از 084 (آدرس دفتر)

## ۵. ادامه‌ی کار با Claude

- قوانین کار در `AGENTS.md` و `.claude/` هستند و Claude Code آن‌ها را خودش می‌خواند.
- وضعیت تسک‌ها و تصمیم‌ها: سند `bonyan-design-gallery-spec.md` در Project «BuildSight» در claude.ai.
