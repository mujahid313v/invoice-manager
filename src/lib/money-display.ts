// Currency display helpers shared by the invoice PDF and the dashboard.
//
// Money is integer cents until the very last step: the formatter splits
// cents into an integer major part and an integer minor part and assembles
// the final string around them, so no cent is ever lost to float math.

// A currency must look like an ISO 4217 code and be known to Intl; anything
// else falls back to USD instead of throwing at render time.
export function normalizeDisplayCurrency(
  currency: string | null | undefined
): string {
  const code = (currency ?? "").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(code)) {
    return "USD";
  }

  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code });

    return code;
  } catch {
    return "USD";
  }
}

export function formatCentsDisplay(
  cents: number,
  currency: string | null | undefined
): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("Money must be a non-negative safe integer in cents.");
  }

  const code = normalizeDisplayCurrency(currency);
  let parts: { type: string; value: string }[];

  try {
    parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).formatToParts(Math.trunc(cents / 100));
  } catch {
    parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).formatToParts(Math.trunc(cents / 100));
  }

  // Split Intl's output into symbol text and grouped digits, then splice the
  // exact two-digit minor part in. Only integer and group parts may touch the
  // number; currency and literal parts around it are kept as-is.
  const firstDigit = parts.findIndex(
    (part) => part.type === "integer" || part.type === "group"
  );
  const lastDigit = (() => {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const type = parts[index].type;

      if (type === "integer" || type === "group") {
        return index;
      }
    }

    return -1;
  })();

  const prefix = parts
    .slice(0, Math.max(firstDigit, 0))
    .filter((part) => part.type !== "decimal" && part.type !== "fraction")
    .map((part) => part.value)
    .join("");
  const integerText = parts
    .slice(firstDigit, lastDigit + 1)
    .filter((part) => part.type === "integer" || part.type === "group")
    .map((part) => part.value)
    .join("");
  const suffix = parts
    .slice(lastDigit + 1)
    .filter((part) => part.type !== "decimal" && part.type !== "fraction")
    .map((part) => part.value)
    .join("");
  const minor = String(cents % 100).padStart(2, "0");

  return `${prefix}${integerText}.${minor}${suffix}`;
}
