CREATE TABLE `did_daily_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callerIdId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`date` varchar(10) NOT NULL,
	`totalCalls` int NOT NULL DEFAULT 0,
	`answered` int NOT NULL DEFAULT 0,
	`noAnswer` int NOT NULL DEFAULT 0,
	`busy` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`shortCalls` int NOT NULL DEFAULT 0,
	`avgDuration` int NOT NULL DEFAULT 0,
	`answerRate` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `did_daily_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `reputationScore` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `reputationUpdatedAt` bigint;