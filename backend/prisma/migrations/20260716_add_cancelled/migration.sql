-- Add CANCELLED to transactions.status enum
ALTER TABLE `transactions` 
  MODIFY COLUMN `status` ENUM('PENDING','SUCCESS','FAILED','REVERSED','CANCELLED') NOT NULL DEFAULT 'PENDING';

-- Note: Run `npx prisma migrate deploy` or `npx prisma migrate dev` to apply this migration via Prisma tooling.
