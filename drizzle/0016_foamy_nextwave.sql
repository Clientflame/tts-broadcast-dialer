CREATE TABLE `throttle_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(64) NOT NULL,
	`agentName` varchar(255),
	`eventType` enum('throttle_triggered','ramp_up','full_recovery','manual_reset') NOT NULL,
	`previousMaxCalls` int,
	`newMaxCalls` int,
	`carrierErrors` int DEFAULT 0,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `throttle_history_id` PRIMARY KEY(`id`)
);
