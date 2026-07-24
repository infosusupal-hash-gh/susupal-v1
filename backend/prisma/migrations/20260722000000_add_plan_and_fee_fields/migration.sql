ALTER TABLE `savings_plans` ADD COLUMN `name` VARCHAR(191) NULL;
ALTER TABLE `transactions` ADD COLUMN `amount_paid` DECIMAL(12,2) NULL,
  ADD COLUMN `fee` DECIMAL(12,2) NULL,
  ADD COLUMN `net_amount` DECIMAL(12,2) NULL;
ALTER TABLE `webhook_payments` ADD COLUMN `amount_paid` DECIMAL(12,2) NULL,
  ADD COLUMN `fee` DECIMAL(12,2) NULL,
  ADD COLUMN `net_amount` DECIMAL(12,2) NULL;
