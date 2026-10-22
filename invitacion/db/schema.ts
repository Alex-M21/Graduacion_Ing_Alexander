import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const guests = sqliteTable("guests", {
  userId: text("user_id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  cuiEncrypted: text("cui_encrypted").notNull(),
  cuiHash: text("cui_hash").notNull().unique(),
  accessHash: text("access_hash").unique(),
  driveSyncedAt: text("drive_synced_at"),
  attendance: text("attendance", { enum: ["yes", "no"] }).notNull(),
  consentAt: text("consent_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => guests.userId),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("photos_created_idx").on(table.createdAt, table.id), index("photos_user_idx").on(table.userId)]);
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
});
