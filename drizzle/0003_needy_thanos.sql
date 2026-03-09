CREATE TABLE `broadcast_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`messageText` text,
	`voice` varchar(50) DEFAULT 'alloy',
	`maxConcurrentCalls` int DEFAULT 1,
	`retryAttempts` int DEFAULT 0,
	`retryDelay` int DEFAULT 300,
	`timezone` varchar(64) DEFAULT 'America/New_York',
	`timeWindowStart` varchar(5) DEFAULT '09:00',
	`timeWindowEnd` varchar(5) DEFAULT '21:00',
	`useDidRotation` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `broadcast_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `caller_ids` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`label` varchar(255),
	`isActive` int NOT NULL DEFAULT 1,
	`callCount` int NOT NULL DEFAULT 0,
	`lastUsedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caller_ids_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `state` varchar(50);--> statement-breakpoint
ALTER TABLE `contacts` ADD `databaseName` varchar(255);