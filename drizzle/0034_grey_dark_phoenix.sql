CREATE TABLE `bridge_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(100) NOT NULL,
	`agentName` varchar(255),
	`eventType` enum('online','offline','installed','install_failed','updated') NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bridge_events_id` PRIMARY KEY(`id`)
);
