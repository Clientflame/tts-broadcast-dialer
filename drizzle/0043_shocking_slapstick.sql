CREATE TABLE `database_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` text,
	`fileSizeBytes` bigint,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`type` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
	`tablesIncluded` int,
	`rowCount` int,
	`errorMessage` text,
	`startedAt` bigint NOT NULL,
	`completedAt` bigint,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `database_backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `license_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licenseKey` varchar(64) NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientEmail` varchar(320),
	`maxDids` int NOT NULL DEFAULT 10,
	`maxConcurrentCalls` int NOT NULL DEFAULT 5,
	`maxAgents` int NOT NULL DEFAULT 3,
	`features` json,
	`status` enum('active','suspended','expired','revoked') NOT NULL DEFAULT 'active',
	`activatedAt` bigint,
	`expiresAt` bigint,
	`lastValidatedAt` bigint,
	`deploymentId` int,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `license_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `license_keys_licenseKey_unique` UNIQUE(`licenseKey`)
);
