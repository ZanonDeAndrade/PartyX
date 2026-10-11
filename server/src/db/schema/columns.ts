import { timestamp } from 'drizzle-orm/pg-core';

/** Instante em UTC (`timestamptz`). O fuso do evento só entra na exibição. */
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const createdAt = () => instant('created_at').notNull().defaultNow();
export const updatedAt = () => instant('updated_at').notNull().defaultNow();
