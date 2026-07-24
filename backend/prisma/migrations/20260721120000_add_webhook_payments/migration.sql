-- CreateTable
CREATE TABLE `webhook_payments` (
  `id` VARCHAR(191) NOT NULL,
  `korapay_ref` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'GHS',
  `status` VARCHAR(191) NOT NULL,
  `payment_method` VARCHAR(191) NULL,
  `event_type` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `used` BOOLEAN NOT NULL DEFAULT false,
  `linked_transaction_id` VARCHAR(191) NULL,
  `approved_by_admin` VARCHAR(191) NULL,
  `approved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `webhook_payments_korapay_ref_key` (`korapay_ref`),
  INDEX `webhook_payments_used_idx` (`used`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
