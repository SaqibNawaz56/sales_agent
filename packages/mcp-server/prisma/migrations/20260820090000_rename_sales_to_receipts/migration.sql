-- Rename the sale-header table to "receipts".
--
-- ALTER TABLE ... RENAME rather than drop-and-recreate: these rows are the
-- shop's ledger and every receipt it has ever issued. A rename preserves them,
-- the sequence behind "id", and the foreign key sale_items.sale_id points at,
-- which follows the table automatically.

ALTER TABLE "sales" RENAME TO "receipts";

-- Postgres leaves index and constraint names alone when a table is renamed, so
-- these are still called "sales_*". Prisma derives the names it expects from
-- the table name, and would read the mismatch as drift on the next
-- `prisma migrate dev` — then "fix" it by dropping and recreating the indexes.
-- Renaming them here keeps the database and the schema in agreement.
ALTER TABLE "receipts" RENAME CONSTRAINT "sales_pkey" TO "receipts_pkey";
ALTER TABLE "receipts" RENAME CONSTRAINT "sales_customer_id_fkey" TO "receipts_customer_id_fkey";

ALTER INDEX "sales_sold_at_idx" RENAME TO "receipts_sold_at_idx";
ALTER INDEX "sales_customer_id_idx" RENAME TO "receipts_customer_id_idx";
ALTER INDEX "sales_receipt_date_receipt_no_key" RENAME TO "receipts_receipt_date_receipt_no_key";

-- sale_items is deliberately untouched. Its table name, its "sale_id" column
-- and its constraint name "sale_items_sale_id_fkey" are all unchanged, so they
-- still match what Prisma expects for that model. Only the table the foreign
-- key points AT has moved, and Postgres repoints it without being asked.
