CREATE TABLE `did_cost_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`callerIdId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`type` enum('purchase','monthly_rental','cnam_lookup','cnam_lidb','release','minutes','other') NOT NULL,
	`amount` varchar(20) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`description` text,
	`referenceId` varchar(255),
	`transactionDate` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `did_cost_transactions_id` PRIMARY KEY(`id`)
);
