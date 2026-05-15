CREATE TABLE `disconnected_numbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`reason` enum('congestion','invalid-number','unallocated','number-changed','disconnected','out-of-service','manual') NOT NULL DEFAULT 'disconnected',
	`campaignId` int,
	`campaignName` varchar(255),
	`contactId` int,
	`databaseName` varchar(255),
	`autoAddedToDnc` int NOT NULL DEFAULT 0,
	`detectedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disconnected_numbers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dnc_list` MODIFY COLUMN `source` enum('manual','import','opt-out','complaint','disconnected') NOT NULL DEFAULT 'manual';