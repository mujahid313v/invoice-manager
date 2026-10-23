# Invoice & Client Manager

A small SaaS web app where freelancers and small businesses register, manage their clients, create professional invoices, download them as PDF, and track which invoices are paid, unpaid or overdue.

## Live Demo

_Coming soon — deployed on Vercel._

**Demo account** (created by the seed script):

| Field    | Value            |
| -------- | ---------------- |
| Email    | demo@example.com |
| Password | demo1234         |

## Screenshots

_Coming soon._

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

- Node.js 20+
- A Neon (or any PostgreSQL) database

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

# 4. Run migrations
npx prisma migrate dev

# 5. Seed the demo account (demo@example.com / demo1234)
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000.

### Environment Variables

| Variable      | Description                              |
| ------------- | ---------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (Neon)     |
| `AUTH_SECRET`  | Secret used to sign session JWTs (jose) |

See `.env.example` for placeholders. **Never commit `.env`.**

## Success Criteria

- User A cannot open User B's invoice by changing the id in the URL.
- A logged-out request to any API route (except register and login) returns 401.
- Totals match to the cent.
- An invoice with a past due date and status Sent is shown as Overdue.
- The app runs on Vercel with a working demo account.

## Timebox

One developer, about **7 days**.

## License

MIT
