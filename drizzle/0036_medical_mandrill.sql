CREATE TABLE `bridge_health_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checkType` enum('heartbeat','ssh_probe','manual') NOT NULL DEFAULT 'heartbeat',
	`status` enum('healthy','degraded','offline','error') NOT NULL DEFAULT 'healthy',
	`responseTimeMs` int,
	`details` text,
	`checkedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bridge_health_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`scheduledAt` bigint NOT NULL,
	`status` enum('pending','launched','cancelled','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`launchedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`config` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaign_templates_id` PRIMARY KEY(`id`)
);
