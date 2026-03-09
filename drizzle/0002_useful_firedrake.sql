CREATE TABLE `dnc_list` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`reason` varchar(255),
	`source` enum('manual','import','opt-out','complaint') NOT NULL DEFAULT 'manual',
	`addedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dnc_list_id` PRIMARY KEY(`id`)
);
