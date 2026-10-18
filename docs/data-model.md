# Data Model Decisions — Invoice Manager MVP

This document records the database-level decisions for the MVP described in
`README.md` and the phase issues. It covers only the persistence foundation;
authentication, UI, PDF rendering, and API behavior are separate tasks.

## Issue #1 / README reconciliation

Issue #1 requires a schema matching the README data model — integer cents for
all money, no floats, a unique `(userId, number)`, and indexes for the
user-scoped query paths. Those requirements are met, plus a small set of
additions that later issues require:

| Addition | Required by |
| --- | --- |
| `User.nextInvoiceNumber` | Issue #4: per-user `INV-0001` numbering inside a transaction, with the `(userId, number)` unique constraint as the backstop. |
| `Invoice.paidAt` | Issue #6: schema change adding `paidAt` for the Phase 8 revenue chart. |
| `InvoiceItem.position` + `@@unique([invoiceId, position])` | Deterministic line-item order for the Issue #6 detail page and the Issue #7 PDF table. |

Earlier draft extensions were removed after review because no issue required
them and they conflicted with the README and later issues:

- The eight business/client snapshot columns — Issues #6 and #7 render the
  live business profile and client rows.
- Per-invoice `currency` — Issue #7 formats money with the business profile's
  currency (fallback `USD`).
- `Invoice.sentAt` — no issue requires it; Issue #6 specifies only `paidAt`.
- `InvoiceItem.lineTotalCents` — Issue #4 computes
  `subtotalCents = Σ(quantity × unitPriceCents)` from item rows.
- `Decimal(12,3)` quantity — Issue #4 and the README specify integers.
- Optional `clientId` with `SetNull` — Issue #3 requires deleting a client
  with invoices to fail (409), so the relation is required with `Restrict`.

The extra `[userId, clientName]` index was removed together with the
snapshots. `[clientId]` supports the `Restrict` check and `(userId, issueDate)`
supports list sorting; `Client`'s `(userId, name)` index keeps `userId` as its
leading column, satisfying the README's `userId` index while supporting name
search.

## Entities

- **User** — account owner. Every other record is ultimately scoped to a user.
- **BusinessProfile** — one per user; defaults used for new invoices.
- **Client** — belongs to a user.
- **Invoice** — belongs to a user and references one of the user's clients.
- **InvoiceItem** — ordered line items belonging to an invoice.

`InvoiceStatus` has only `DRAFT`, `SENT`, and `PAID`. Overdue is derived, not
stored.

## 1. Invoice status transitions

| Current status | Allowed next status | Notes |
| --- | --- | --- |
| `DRAFT` | `SENT` | Editable and deletable. |
| `SENT` | `PAID` | No longer editable or deletable. Entering `PAID` sets `paidAt`. |
| `PAID` | — | Terminal in the MVP. No un-pay/reversal flow. |

- Only `DRAFT -> SENT` and `SENT -> PAID` are allowed (Issue #6). Every other
  transition — including `DRAFT -> PAID` and any transition out of `PAID` — is
  rejected with 409 by the application layer.
- `paidAt` is written in the same transaction as the status change and is
  taken from the server clock, never from the request.
- Listing a draft as "overdue" is not allowed. An invoice is **overdue** when
  `status = SENT` and `dueDate < current UTC date`. No `OVERDUE` value is
  persisted, so the status is always derived consistently.
- `issueDate` and `dueDate` are calendar dates (`date`), not moments.
- Only drafts may be edited or deleted. Once an invoice is sent or paid, its
  financial content is immutable.

## 2. Tax and discount calculation rules

- The only discount supported in the MVP is a fixed amount in cents
  (`discountCents`). Percentage discounts are out of scope.
- `taxPercent` stores a percentage value, not a fraction (for example `8.25`
  means 8.25%). It is stored per invoice as `Decimal(5,2)`.
- The server computes all totals; clients never submit totals (Issue #4).
- Calculation order (pure integer math until the single tax rounding):

  ```text
  subtotalCents = sum(quantity * unitPriceCents for every line)
  taxableCents  = subtotalCents - discountCents
  taxCents      = roundHalfUp(taxableCents * taxPercent / 100)
  totalCents    = taxableCents + taxCents
  ```

- Line totals are not stored. `quantity` and `unitPriceCents` are both
  integers, so each line total is exact with no rounding step.
- The discount is applied before tax.
- `discountCents` must satisfy `0 <= discountCents <= subtotalCents`. Invalid
  input is rejected; it is never silently clamped.
- Example: quantity `2`, unit price `1999` cents, discount `500` cents, tax
  `10.00%`:
  - subtotal: `2 * 1999 = 3998` cents
  - taxable: `3998 - 500 = 3498` cents
  - tax: `roundHalfUp(3498 * 10 / 100) = 350` cents
  - total: `3848` cents

## 3. Monetary precision and rounding

- All monetary columns are integer cents (`Int`): `unitPriceCents`,
  `discountCents`, `subtotalCents`, `taxCents`, and `totalCents`. Money is
  never stored as a floating-point value.
- `quantity` is `Int` (`>= 1` per Issue #4), so line math is exact.
- Tax rates use `Decimal(5,2)`.
- Rounding is **half-up to the nearest cent**, applied once, for tax only. No
  intermediate floating-point math is allowed.
- `subtotalCents`, `taxCents`, and `totalCents` are stored on the invoice and
  must satisfy `totalCents = subtotalCents - discountCents + taxCents`.
- Currency is a three-letter ISO 4217 code stored on the business profile
  only (`USD` default). Invoices carry no currency column; displays and PDFs
  format amounts with the profile's currency (Issue #7). No currency
  conversion is implemented.

## 4. Invoice-number uniqueness strategy

- `User.nextInvoiceNumber` is the per-user counter, starting at `1`.
- Invoice numbers are formatted as `INV-0001`, `INV-0002`, and so on. The
  format grows naturally beyond four digits.
- Creating an invoice must atomically:
  1. increment and read the user's counter inside the same transaction that
     inserts the invoice; and
  2. store the resulting number on the invoice.
- The `@@unique([userId, number])` constraint is the database backstop against
  duplicates and concurrent requests. On a unique-constraint race, creation is
  retried once (Issue #4).
- Numbering is per user, never global. Deleted drafts leave gaps, and numbers
  are never reused; sequence reuse would make accounting references ambiguous.
- The counter increment must not occur outside the invoice-insert transaction.

## 5. Client deletion behavior

- `Invoice.clientId` is required and uses `onDelete: Restrict`.
- Deleting a client that still has invoices returns **409** with a clear
  message (Issue #3). The application checks for invoices first and returns
  the 409; the `Restrict` foreign key is the database backstop that makes
  losing invoices through a client delete impossible.
- Deleting a client without invoices succeeds and removes them from the list
  immediately.
- Because `clientId` is required, every invoice references an existing client
  at creation time, and a client with invoices can never be removed while
  those invoices exist.
- Caveat for future work: account deletion is out of scope for the MVP. If it
  is ever added, the delete must remove invoices before clients; `Restrict`
  does not by itself order the two cascading paths from `User`.

## 6. Live business and client data

- Invoices reference the client with a required foreign key and belong to a
  user; there are no snapshot columns.
- Detail views and PDFs render the live business profile and client rows
  (Issues #6 and #7), including the profile's currency.
- Consequence: editing the business profile or a client changes what existing
  invoices display. This is the behavior the issues specify; snapshot columns
  were reviewed and rejected.

## Initial migration status

`prisma/migrations/20261018110032_init/migration.sql` was generated offline
with `prisma migrate diff --from-empty`. It has **not** been applied or
validated against PostgreSQL yet. Applying it with `prisma migrate dev`
requires a reachable PostgreSQL instance and a shadow database. The migration
must not be considered verified until it applies cleanly in such an
environment.

## Database constraints and indexes

Implemented in `prisma/schema.prisma`:

- Unique email per user.
- One business profile per user (`BusinessProfile.userId @unique`).
- Unique invoice number per user (`@@unique([userId, number])`).
- Unique line position per invoice (`@@unique([invoiceId, position])`).
- Foreign keys:
  - user -> business profile/client/invoice: `Cascade`
  - invoice -> items: `Cascade`
  - client -> invoice: `Restrict`
- Invoice indexes: `clientId`, `(userId, status)`, `(userId, issueDate)`,
  `(userId, dueDate)`.
- Client index: `(userId, name)` — leading `userId` column satisfies the
  README's `userId` index.

Prisma cannot express every rule as a database constraint. The application
layer must enforce:

- ownership checks, including verifying that `clientId` belongs to the session
  user;
- at least one line item;
- `quantity >= 1` (integer), `unitPriceCents >= 0`, `0 <= taxPercent <= 100`;
- `0 <= discountCents <= subtotalCents` and the totals equation;
- status transition legality — `DRAFT -> SENT` and `SENT -> PAID` only;
- `paidAt` from the server clock, written in the status-change transaction;
- the 409 check before deleting a client with invoices;
- normalized lowercase emails and uppercase ISO currency codes.

If stronger guarantees are required later, these can be added as PostgreSQL
`CHECK` constraints in a dedicated migration.

## Deliberately excluded

Stored `OVERDUE` status, business/client snapshot columns, payment/installment
tables, soft deletes, audit history, percentage discounts, multi-currency
conversion, tax labels/VAT registries, recurring invoices, and account
deletion.
