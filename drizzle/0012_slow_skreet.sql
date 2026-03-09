ALTER TABLE `caller_ids` ADD `healthStatus` enum('unknown','healthy','degraded','failed') DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `lastCheckAt` bigint;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `lastCheckResult` text;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `consecutiveFailures` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `autoDisabled` int DEFAULT 0 NOT NULL;