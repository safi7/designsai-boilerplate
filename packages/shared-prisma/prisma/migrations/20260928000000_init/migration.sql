-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `last_name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NULL,
    `status` ENUM('pending', 'active', 'banned', 'deactivated') NOT NULL DEFAULT 'pending',
    `email_verified_at` TIMESTAMP(0) NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'en',
    `country` VARCHAR(5) NULL,
    `avatar_key` VARCHAR(255) NULL,
    `last_login_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `users_email_unique`(`email`),
    INDEX `users_status_index`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `jti` VARCHAR(36) NOT NULL,
    `user_agent` VARCHAR(500) NULL,
    `ip_address` VARCHAR(45) NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `last_used_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `user_sessions_jti_key`(`jti`),
    INDEX `user_sessions_user_expires_index`(`user_id`, `expires_at`),
    INDEX `user_sessions_expires_index`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauth_accounts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `provider` ENUM('google') NOT NULL,
    `provider_account_id` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `last_login_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `oauth_accounts_user_index`(`user_id`),
    UNIQUE INDEX `oauth_accounts_provider_account_unique`(`provider`, `provider_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'UPLOAD', 'PURCHASE', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'EMAIL_VERIFY') NOT NULL,
    `resource_type` ENUM('User', 'Session', 'Profile', 'CreditTransaction', 'Payment', 'AgentThread') NOT NULL,
    `resource_id` VARCHAR(191) NULL,
    `status` ENUM('success', 'failed') NOT NULL DEFAULT 'success',
    `description` TEXT NULL,
    `changes` JSON NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `request_id` VARCHAR(64) NULL,
    `request_method` VARCHAR(10) NULL,
    `endpoint` VARCHAR(255) NULL,
    `error_message` TEXT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_created_index`(`user_id`, `created_at`),
    INDEX `audit_logs_resource_index`(`resource_type`, `resource_id`),
    INDEX `audit_logs_action_created_index`(`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_sources` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `source_type` ENUM('signup_bonus', 'purchase', 'promotional', 'manual_adjustment', 'refund') NOT NULL,
    `total_allocated` DECIMAL(18, 6) NOT NULL,
    `remaining` DECIMAL(18, 6) NOT NULL,
    `reference_type` VARCHAR(50) NULL,
    `reference_id` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `credit_sources_user_active_expires_index`(`user_id`, `is_active`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('grant', 'usage', 'refund', 'expiry', 'adjustment') NOT NULL,
    `amount` DECIMAL(18, 6) NOT NULL,
    `balance_before` DECIMAL(18, 6) NOT NULL,
    `balance_after` DECIMAL(18, 6) NOT NULL,
    `idempotency_key` VARCHAR(191) NULL,
    `reference_type` VARCHAR(50) NULL,
    `reference_id` VARCHAR(191) NULL,
    `description` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_transactions_idempotency_unique`(`idempotency_key`),
    INDEX `credit_transactions_user_created_index`(`user_id`, `created_at`),
    INDEX `credit_transactions_reference_index`(`reference_type`, `reference_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transaction_sources` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `credit_transaction_id` BIGINT UNSIGNED NOT NULL,
    `credit_source_id` BIGINT UNSIGNED NOT NULL,
    `amount` DECIMAL(18, 6) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_transaction_sources_transaction_index`(`credit_transaction_id`),
    INDEX `credit_transaction_sources_source_index`(`credit_source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_usage_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `credit_transaction_id` BIGINT UNSIGNED NOT NULL,
    `feature` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(18, 6) NOT NULL,
    `provider` VARCHAR(50) NULL,
    `model` VARCHAR(191) NULL,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `thread_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_usage_logs_credit_transaction_id_key`(`credit_transaction_id`),
    INDEX `credit_usage_logs_user_created_index`(`user_id`, `created_at`),
    INDEX `credit_usage_logs_thread_index`(`thread_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_packages` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `package_id` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `credits` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `validity_days` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `credit_packages_package_id_unique`(`package_id`),
    INDEX `credit_packages_active_sort_index`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `credit_package_id` BIGINT UNSIGNED NOT NULL,
    `provider` VARCHAR(20) NOT NULL DEFAULT 'stripe',
    `provider_session_id` VARCHAR(255) NOT NULL,
    `status` ENUM('pending', 'succeeded', 'failed', 'expired') NOT NULL DEFAULT 'pending',
    `credits` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_provider_session_unique`(`provider_session_id`),
    INDEX `payments_user_created_index`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_threads` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `domain` ENUM('ask_ai') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('idle', 'running', 'failed') NOT NULL DEFAULT 'idle',
    `is_favorite` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `last_message_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `agent_threads_user_list_index`(`user_id`, `is_deleted`, `last_message_at` DESC, `id`),
    INDEX `agent_threads_user_favorite_index`(`user_id`, `is_favorite`, `is_deleted`, `last_message_at` DESC),
    INDEX `agent_threads_status_updated_index`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ask_ai_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `agent_thread_id` VARCHAR(191) NOT NULL,
    `mastra_thread_id` VARCHAR(191) NOT NULL,
    `event_cursor` INTEGER NOT NULL DEFAULT 0,
    `active_turn_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ask_ai_conversations_agent_thread_id_key`(`agent_thread_id`),
    UNIQUE INDEX `ask_ai_conversations_mastra_thread_id_key`(`mastra_thread_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ask_ai_thread_events` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `event_cursor` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `payload` JSON NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ask_ai_thread_events_cursor_unique`(`conversation_id`, `event_cursor`),
    UNIQUE INDEX `ask_ai_thread_events_dedupe_unique`(`conversation_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_token_usage` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `agent_id` VARCHAR(100) NOT NULL,
    `thread_id` VARCHAR(191) NULL,
    `turn_id` VARCHAR(64) NOT NULL,
    `model_id` VARCHAR(191) NOT NULL,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `total_tokens` INTEGER NOT NULL DEFAULT 0,
    `credits_charged` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_token_usage_turn_unique`(`turn_id`),
    INDEX `agent_token_usage_user_created_index`(`user_id`, `created_at`),
    INDEX `agent_token_usage_thread_created_index`(`thread_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_sources` ADD CONSTRAINT `credit_sources_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transaction_sources` ADD CONSTRAINT `credit_transaction_sources_credit_transaction_id_fkey` FOREIGN KEY (`credit_transaction_id`) REFERENCES `credit_transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transaction_sources` ADD CONSTRAINT `credit_transaction_sources_credit_source_id_fkey` FOREIGN KEY (`credit_source_id`) REFERENCES `credit_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_usage_logs` ADD CONSTRAINT `credit_usage_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_usage_logs` ADD CONSTRAINT `credit_usage_logs_credit_transaction_id_fkey` FOREIGN KEY (`credit_transaction_id`) REFERENCES `credit_transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_credit_package_id_fkey` FOREIGN KEY (`credit_package_id`) REFERENCES `credit_packages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_threads` ADD CONSTRAINT `agent_threads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ask_ai_conversations` ADD CONSTRAINT `ask_ai_conversations_agent_thread_id_fkey` FOREIGN KEY (`agent_thread_id`) REFERENCES `agent_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ask_ai_thread_events` ADD CONSTRAINT `ask_ai_thread_events_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ask_ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

