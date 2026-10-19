import type { Prisma } from "@prisma/client";

export const clientSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

export function clientListWhere(
  userId: string,
  search: string | null | undefined
): Prisma.ClientWhereInput {
  const term = search?.trim() ?? "";

  if (!term) {
    return { userId };
  }

  return {
    userId,
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ],
  };
}
