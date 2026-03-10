ALTER TABLE `caller_ids` ADD `recentCallCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `recentFailCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `failureRate` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `flaggedAt` bigint;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `flagReason` varchar(255);--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `cooldownUntil` bigint;