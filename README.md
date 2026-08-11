# MLBB Top-Up

A small Express + SQLite MLBB top-up storefront based on the supplied `MLBB-TopUp-v2.zip`.

## Features

- Player ID + Zone ID verification through a configurable external ID-check provider.
- Package selection.
- KPay / WavePay payment destination shown from admin settings.
- Order creation with unique order number.
- Payment reference submission.
- Customer order history/status page.
- Admin login with JWT.
- Admin order workflow: `PENDING_PAYMENT` → `PAYMENT_SUBMITTED` → `PROCESSING` → `COMPLETED` / `REJECTED`.
- Receipt number generated when an order is marked `COMPLETED`.
- SQLite database is kept on the VPS and is intentionally ignored by Git.
- Idempotent database migration that preserves an existing `database.db`.

## Files

```text
MLBB-TopUp/
├── db/
│   └── migrate.js
├── public/
│   ├── admin.html
│   ├── history.html
│   └── index.html
├── scripts/
│   ├── first-install.sh
│   └── update.sh
├── .env.example
├── .gitignore
├── config.example.json
├── package.json
├── README.md
├── server.js
└── update.sh
```

## GitHub

Do not commit `database.db`, `config.json`, `.env`, or API credentials.

Example:

```bash
git init
git add .
git commit -m "Initial MLBB top-up project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## VPS first install

If the repo is already cloned to `~/MLBB-TopUp`:

```bash
cd ~/MLBB-TopUp
cp config.example.json config.json
nano config.json
npm install
npm run migrate
npm run check
pm2 start server.js --name mlbb-topup
pm2 save
```

If you already have an old `database.db`, keep it in the project directory. `npm run migrate` adds the missing columns without deleting existing order data.

## VPS update after GitHub push

```bash
cd ~/MLBB-TopUp
./update.sh
```

The update script does:

1. `git pull --ff-only`
2. `npm ci --omit=dev`
3. `npm run migrate`
4. JavaScript syntax check
5. PM2 restart
6. `pm2 save`

## Admin

Open:

```text
http://YOUR-VPS-IP/admin.html
```

Change the admin password in `config.json` or use `ADMIN_PASSWORD` as an environment variable before production use.

## ID-check API

The server does not invent/fake player names. Add your real provider endpoint and credentials in `config.json` or environment variables.

Supported environment variables:

```text
MLBB_ID_API_URL
MLBB_ID_API_KEY
MLBB_ID_API_KEY_HEADER
MLBB_ID_API_ID
```

The provider response should expose a nickname in one of these fields:

- `data.nickname`
- `nickname`
- `username`
- `ign`
- `data.username`

A provider-specific request/response format may require small changes in `checkIdWithProvider()`.
