-- CreateTable
CREATE TABLE `payment_confirmation_requests` (
  `id` VARCHAR(191) NOT NULL,
  `transaction_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `korapay_reference` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `notes` TEXT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `payment_confirmation_requests_status_idx` (`status`),
  INDEX `payment_confirmation_requests_user_id_idx` (`user_id`),
  INDEX `payment_confirmation_requests_transaction_id_idx` (`transaction_id`),
  CONSTRAINT `payment_confirmation_requests_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payment_confirmation_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
