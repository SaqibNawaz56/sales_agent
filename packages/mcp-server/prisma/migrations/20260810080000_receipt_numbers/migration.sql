-- Daily receipt numbers.
--
-- Added nullable, backfilled, then made NOT NULL, so the existing sales in a
-- running shop keep working rather than the migration failing on them.

-- Step 1: add the columns, nullable for now.
ALTER TABLE "sales" ADD COLUMN "receipt_date" DATE;
ALTER TABLE "sales" ADD COLUMN "receipt_no" INTEGER;

-- Step 2: backfill. Numbering runs in sale order within each UTC day, so the
-- receipt numbers match the order the sales were actually made. `id` breaks
-- ties, because two sales in the same millisecond still need distinct numbers.
--
-- (sold_at AT TIME ZONE 'UTC')::date rather than sold_at::date: the column is
-- TIMESTAMP(3) without a zone, and casting straight to date would use the
-- server's local day. query_daily_total buckets on UTC, and these two must
-- agree about which sales belong to which day.
WITH numbered AS (
  SELECT
    "id",
    (("sold_at" AT TIME ZONE 'UTC')::date) AS day,
    ROW_NUMBER() OVER (
      PARTITION BY (("sold_at" AT TIME ZONE 'UTC')::date)
      ORDER BY "sold_at", "id"
    ) AS seq
  FROM "sales"
)
UPDATE "sales" AS s
SET "receipt_date" = n.day,
    "receipt_no" = n.seq
FROM numbered AS n
WHERE s."id" = n."id";

-- Step 3: now that every row has values, require them.
ALTER TABLE "sales" ALTER COLUMN "receipt_date" SET NOT NULL;
ALTER TABLE "sales" ALTER COLUMN "receipt_no" SET NOT NULL;

-- Step 4: one number per day. This is what makes a duplicate a failed write
-- rather than a silently shared receipt number.
CREATE UNIQUE INDEX "sales_receipt_date_receipt_no_key"
  ON "sales"("receipt_date", "receipt_no");
