CREATE TABLE `script_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scriptId` int NOT NULL,
	`version` int NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`changeType` enum('created','edited','reverted') NOT NULL DEFAULT 'edited',
	`changeSummary` text,
	`name` varchar(255) NOT NULL,
	`description` text,
	`callbackNumber` varchar(20),
	`segments` json NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `script_versions_id` PRIMARY KEY(`id`)
);
