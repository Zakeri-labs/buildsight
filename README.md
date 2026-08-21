# buildsight

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_jApAgDjwmROxJOdOAVTybAmpoWW1)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Configuration

Configure OpenAI API features using dedicated environment variables:

```bash
# Shared OpenAI API Key used across all AI features
OPENAI_API_KEY="sk-..."

# 1) Report & Document Translation Model
# Controls the AI model used for report translation workflows.
# Default: gpt-5.6
OPENAI_REPORT_TRANSLATION_MODEL="gpt-5.6"

# 2) Voice-to-Text / Audio Transcription Model
# Controls the speech-to-text model used for voice recordings.
# Default: whisper-1
OPENAI_TRANSCRIPTION_MODEL="whisper-1"

# 3) Form Text Enhancement Model
# Controls the AI model used for in-form text enhancement & inline translation.
# Default: gpt-4o-mini
OPENAI_ENHANCE_TEXT_MODEL="gpt-4o-mini"

# 4) AI Summary Model
# Controls the AI model used for multi-document AI summary generation.
# Default: gpt-5.6
OPENAI_SUMMARY_MODEL="gpt-5.6"
```

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
