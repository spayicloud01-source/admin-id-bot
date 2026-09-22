# Admin ID Bot

LINE Messaging API webhook for the Admin ID back-office bot.

## Endpoints

- `GET /api/health`
- `GET /api/line/webhook`
- `POST /api/line/webhook`

## Required Vercel environment variables

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `SPREADSHEET_ID`

Google Sheets authentication will be added before customer lookup is enabled.
