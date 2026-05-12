CREATE TABLE `did_import_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`source` varchar(50) NOT NULL,
	`totalCount` int NOT NULL DEFAULT 0,
	`importedCount` int NOT NULL DEFAULT 0,
	`duplicatesSkipped` int NOT NULL DEFAULT 0,
	`routesCreated` int NOT NULL DEFAULT 0,
	`routesFailed` int NOT NULL DEFAULT 0,
	`defaultDescription` varchar(255),
	`defaultDestination` varchar(255),
	`cidPrefix` varchar(50),
	`dids` json,
	`errors` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `did_import_history_id` PRIMARY KEY(`id`)
);
