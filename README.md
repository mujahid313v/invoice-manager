# Invoice & Client Manager

A small SaaS web app where freelancers and small businesses register, manage their clients, create professional invoices, download them as PDF, and track which invoices are paid, unpaid or overdue.

## Live Demo

**Live demo: `https://invoice-manager-ebon-omega.vercel.app/`** (deployed on Vercel with a Neon database)

**Demo accounts** (all created by the seed script — `npm run db:seed`; every
one uses the shared password `demo1234`):

| Email              | Business                     | Currency | Invoices |
| ------------------ | ---------------------------- | -------- | -------- |
| demo@example.com   | Brightline Studio            | USD      | 14       |
| sara@example.com   | Sara Khan Web Development    | USD      | 12       |
| rahul@example.com  | Rahul Digital Agency         | INR      | 15       |
| emma@example.com   | Emma Weber Photography       | EUR      | 10       |
| david@example.com  | David Miller Consulting      | GBP      | 18       |
| priya@example.com  | Priya Design Studio          | INR      | 20       |

## Screenshots

> Add the captured images under `docs/screenshots/` after the deploy, then
> uncomment the lines below. Placeholders — do not invent images.

<!-- ![Dashboard](docs/screenshots/dashboard.png) -->
<!-- ![Invoice list](docs/screenshots/invoices.png) -->
<!-- ![Invoice detail](docs/screenshots/invoice-detail.png) -->
<!-- ![Invoice PDF](docs/screenshots/pdf.png) -->

| File to capture                  | Suggested page                |
| -------------------------------- | ----------------------------- |
| `docs/screenshots/dashboard.png` | `/dashboard` with demo data   |
| `docs/screenshots/invoices.png`  | `/invoices` list              |
| `docs/screenshots/invoice-detail.png` | `/invoices/[id]` detail  |
| `docs/screenshots/pdf.png`       | Downloaded `INV-0001.pdf`     |

## Problem It Solves

Freelancers and small shops often create invoices in Word or Excel, lose track of who has paid, and forget to follow up on overdue payments. This app keeps clients, invoices and payment status in one place and shows a simple dashboard of income and outstanding money.

## Target Users

Freelancers, small agencies, shop owners and consultants. Each registered user is an independent **Owner** who only sees their own data (multi-user, fully isolated).

## Tech Stack

- **Next.js (App Router)** with TypeScript
- **Tailwind CSS**
- **Prisma ORM** with PostgreSQL ([Neon](https://neon.tech)) — PostgreSQL from day one, no SQLite
- Deployed on **Vercel**
- Auth: server-side sessions via signed **httpOnly cookie** + **jose** JWT (`AUTH_SECRET` env var)
- Passwords hashed with **bcrypt**, input validated with **zod**

### Data rules

- Lists are stored as **JSON / Postgres arrays**, never as plain strings.
- Money is stored as **integer cents**, never floats.

## Features (MVP)

Implemented (Phases 1–8): authentication, business profile, client CRUD, the
invoice builder with server-computed totals, statuses, the invoice list, the
invoice detail page with status workflow, PDF download and the dashboard.
The seed script (Phase 9) provides the demo data.

1. **Authentication** — register, login, logout with server-side sessions (signed httpOnly cookie, jose JWT).
2. **Business profile** — business name, address, logo URL, currency, default tax percentage, payment instructions text.
3. **Clients** — create, edit, delete, list, search. Fields: name, email, phone, address, notes.
4. **Invoice builder**
   - Select a client, issue date, due date.
   - Dynamic line items (description, quantity, unit price) that can be added or removed.
   - Tax percentage and optional discount.
   - Subtotal, tax and total calculated **on the server** (the client never sends totals).
   - Automatic invoice number per user (`INV-0001`, `INV-0002`, ...), unique per user.
5. **Invoice statuses** — Draft, Sent, Paid, Overdue. Overdue is detected automatically when the due date has passed and the invoice is not Paid.
6. **Invoice list** — search by number or client, filter by status, pagination, sorting by date or amount.
7. **Invoice detail page** — actions: edit (only while Draft), mark as Sent, mark as Paid, delete (only while Draft), download PDF.
8. **PDF download** — a clean professional invoice layout with business details, client details, line items, totals and payment instructions.
9. **Dashboard** — total revenue (paid), outstanding amount, overdue count and amount, last 6 months revenue chart, latest 5 invoices.

### Nice to Have (after MVP)

- Duplicate an invoice
- Recurring invoices
- CSV export
- Public read-only invoice link with a random unguessable token
- Send invoice by email
- Dark mode

### Out of Scope

Online payment gateways, multi-currency conversion, team accounts, mobile app.

## Data Model

User, BusinessProfile, Client, Invoice, InvoiceItem.

- **Invoice**: userId, clientId, number, status, issueDate, dueDate, paidAt, taxPercent, discountCents, subtotalCents, taxCents, totalCents, notes.
- **InvoiceItem**: invoiceId, description, quantity, unitPriceCents.
- Unique constraint on `(userId, number)`.
- Indexes on `userId`, `status` and `dueDate`.

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  businessProfile BusinessProfile?
  clients         Client[]
  invoices        Invoice[]
}

model BusinessProfile {
  id                String  @id @default(cuid())
  userId            String  @unique
  businessName      String
  address           String?
  logoUrl           String?
  currency          String  @default("USD")
  defaultTaxPercent Decimal @db.Decimal(5, 2) @default(0)
  paymentInstructions String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Client {
  id        String   @id @default(cuid())
  userId    String
  name      String
  email     String?
  phone     String?
  address   String?
  notes     String?
  createdAt DateTime @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  invoices Invoice[]

  @@index([userId])
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
}

model Invoice {
  id             String        @id @default(cuid())
  userId         String
  clientId       String
  number         String
  status         InvoiceStatus @default(DRAFT)
  issueDate      DateTime
  dueDate        DateTime
  paidAt         DateTime?
  taxPercent     Decimal       @db.Decimal(5, 2)
  discountCents  Int           @default(0)
  subtotalCents  Int
  taxCents       Int
  totalCents     Int
  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  user   User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  client Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  items  InvoiceItem[]

  @@unique([userId, number])
  @@index([userId, status])
  @@index([userId, dueDate])
}

model InvoiceItem {
  id             String @id @default(cuid())
  invoiceId      String
  description    String
  quantity       Int
  unitPriceCents Int

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
}
```

> **Note:** `Overdue` is not stored — it is computed at read time (`status = SENT` and `dueDate < now`) so it is always correct.

## Security Requirements

- Never trust a `userId` sent by the client — always use the id from the verified server session.
- Every database query is scoped by the session user id. A user must never be able to read or change another user's clients or invoices (**404** for records that are not theirs).
- Passwords hashed with **bcrypt**.
- Validate every API input with **zod**.
- Rate limit login and register.
- No secrets in the repo. `.env.example` contains empty placeholders only (`DATABASE_URL`, `AUTH_SECRET`). Never commit `.env` or any database file.

## Quality Requirements

- Responsive on mobile.
- Clear loading, empty and error states on every page.
- API errors return JSON `{ "error": "..." }` with the correct status code (400, 401, 404, 409, 500).
- `npm run build` must pass with no TypeScript or lint errors.
- Seed script that creates one demo account with sample clients and invoices for the live demo.
- README with project description, features, screenshots, setup steps, environment variables and the live demo link.

## API Overview

| Method | Route                        | Description                                     |
| ------ | ---------------------------- | ----------------------------------------------- |
| POST   | `/api/auth/register`         | Create account (rate limited)                   |
| POST   | `/api/auth/login`            | Login (rate limited)                            |
| POST   | `/api/auth/logout`           | Logout                                          |
| GET    | `/api/business-profile`      | Get current user's business profile             |
| PUT    | `/api/business-profile`      | Create/update business profile                  |
| GET    | `/api/clients`               | List/search clients                             |
| POST   | `/api/clients`               | Create client                                   |
| GET    | `/api/clients/[id]`          | Get one client (404 if not owned)               |
| PUT    | `/api/clients/[id]`          | Update client                                   |
| DELETE | `/api/clients/[id]`          | Delete client                                   |
| GET    | `/api/invoices`              | List/search/filter/paginate/sort invoices       |
| POST   | `/api/invoices`              | Create invoice (server computes totals)         |
| GET    | `/api/invoices/[id]`         | Get one invoice with items                      |
| PUT    | `/api/invoices/[id]`         | Edit (Draft only)                               |
| PATCH  | `/api/invoices/[id]/status`  | Mark as Sent / Paid                             |
| DELETE | `/api/invoices/[id]`         | Delete (Draft only)                             |
| GET    | `/api/invoices/[id]/pdf`     | Download invoice as PDF                         |
| GET    | `/api/dashboard`             | Dashboard stats + last 6 months revenue + latest invoices |

All routes (except register/login) require a valid session and return **401** otherwise.

## Getting Started

### Prerequisites

- **Node.js 20.9+** for the app (`engines` is enforced; the repo is developed
  on Node 24). The seed script uses Node's native TypeScript execution, so
  running `npm run db:seed` needs **Node 23.6+** (or 22.6+ with
  `--experimental-strip-types`).
- A **Neon** (or any PostgreSQL) database.

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/mujahid313v/invoice-manager.git
cd invoice-manager

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL and AUTH_SECRET in .env

# 4. Run migrations (local development)
npx prisma migrate dev

# 5. Seed the six demo accounts (password demo1234 for all of them)
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000. Sign in with the demo account, or register your
own user for an empty workspace.

The seed is **idempotent**: it upserts by unique keys (`email`,
`(userId, number)`, deterministic demo `client.id`s), replaces the seeded
invoices' line items atomically, and never touches rows belonging to other
users. Run it as many times as you like — dates refresh relative to today so
the dashboard chart always shows the last 6 months. `npx prisma db seed`
runs the same script.

### Environment Variables

| Variable       | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `DATABASE_URL` | PostgreSQL connection string (Neon). Pooled URL is fine for the app. |
| `AUTH_SECRET`  | Secret used to sign session JWTs (jose). `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

`.env.example` contains empty placeholders only. **Never commit `.env`.**

> **Migrations on Neon pooled connections:** Prisma's `migrate` commands can
> fail against a pooled (`-pooler`) connection string because advisory locks
> are not supported. For `npx prisma migrate deploy`, temporarily point
> `DATABASE_URL` at the **direct** (non-pooled) Neon URL, or adopt the
> standard split (`DATABASE_URL` pooled for the app + `DIRECT_URL` direct for
> migrations, which requires adding `directUrl = env("DIRECT_URL")` to the
> datasource block). The app runtime uses `DATABASE_URL` either way.

### npm scripts

| Script                    | Purpose                                        |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | Dev server                                    |
| `npm run build`           | Production build (no DB access)               |
| `npm run start`           | Serve the production build                    |
| `npm run lint`            | ESLint                                        |
| `npm run typecheck`       | `tsc --noEmit`                                |
| `npm test`                | Unit tests only — no database, no network     |
| `npm run db:seed`         | Seed/refresh the demo accounts (needs DB)   |
| `npm run db:migrate`      | `prisma migrate dev` (local)                  |
| `npm run db:migrate:deploy` | `prisma migrate deploy` (production)        |
| `npm run vercel-build`    | Vercel build command: generate + migrate + build |

### Integration tests (need a database)

The env-gated suites run against a real Neon database and a production
build; they create throwaway users and clean up after themselves:

```powershell
npm run build
$env:RUN_INVOICE_DETAIL_API_TESTS="1"; node --env-file=.env --test tests/invoice-detail-api.test.mjs
$env:RUN_INVOICE_PDF_TESTS="1"; node --env-file=.env --test tests/invoice-pdf.test.mjs
$env:RUN_DASHBOARD_TESTS="1"; node --env-file=.env --test tests/dashboard-api.test.mjs
```

## Deploying to Vercel + Neon

1. Create a **Neon project**; copy the **pooled** connection string.
2. In **Vercel**, import the repo and set **Node.js** to 20+ (Project
   Settings → General → Root Settings; `engines` already requires >=20.9).
3. Set environment variables (Production, Preview and Development):
   - `DATABASE_URL` — the Neon pooled URL
   - `AUTH_SECRET` — `openssl rand -base64 32` (or the Node one-liner above)
4. Build settings: Vercel automatically uses `vercel-build` when present —
   it runs `prisma generate && prisma migrate deploy && next build`, so the
   schema is applied on deploy. **The seed is not part of the build** and
   must stay manual. If `migrate deploy` fails on the pooled URL, set
   `DATABASE_URL` (or the planned `DIRECT_URL`) to the direct Neon URL for
   the build command only, per the note above.
5. After the first successful deploy, run the seed once against the
   production database from your machine:
   ```powershell
   $env:DATABASE_URL="<neon-url>"; npm run db:seed
   ```
6. Log in at the deployed URL with `demo@example.com` / `demo1234` (the
   seed also creates five more demo accounts, all with password
   `demo1234`), confirm
   the dashboard shows data, and put the URL in the README **Live Demo**
   section (replace `<ADD URL AFTER DEPLOY>`).

## Success Criteria

| Criterion | Proof | Coverage |
| --------- | ----- | -------- |
| User A cannot open User B's invoice by changing the id in the URL | `findInvoiceForUser` returns null → 404 (`src/lib/invoices.ts`, `src/app/api/invoices/[id]/route.ts`) | Env-gated integration test (`tests/invoice-detail-api.test.mjs`) |
| A logged-out request to any API route (except register and login) returns 401 | `requireUser` (`src/lib/auth.ts`) used by every data route | Env-gated integration tests + manual check |
| Totals match to the cent | `computeInvoiceTotals` integer-cents math (`src/lib/invoice-totals.ts`); `tests/invoices.test.mjs`, `tests/seed-data.test.mjs` | Unit tests |
| An invoice with a past due date and status Sent is shown as Overdue | `effectiveInvoiceStatus` (`src/lib/invoice-status.ts`) | Unit tests (`tests/invoice-detail.test.mjs`) + seeded demo data |
| The app runs on Vercel with a working demo account | Seed script (`prisma/seed.ts`, `npm run db:seed`) + deploy section above | Manual check after deploy (owner) |

## Timebox

One developer, about **7 days**.

## License

MIT
