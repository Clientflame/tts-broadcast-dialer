CREATE TABLE `caller_id_regions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callerIdId` int NOT NULL,
	`state` varchar(50),
	`areaCode` varchar(10),
	CONSTRAINT `caller_id_regions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`totalCalls` int NOT NULL DEFAULT 0,
	`answeredCalls` int NOT NULL DEFAULT 0,
	`avgDuration` int NOT NULL DEFAULT 0,
	`lastCallResult` varchar(50),
	`tags` json,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trunkCostPerMinute` varchar(20) NOT NULL DEFAULT '0.01',
	`ttsCostPer1kChars` varchar(20) NOT NULL DEFAULT '0.015',
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`avgCallDurationSecs` int NOT NULL DEFAULT 30,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cost_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `call_logs` ADD `ivrAction` varchar(50);--> statement-breakpoint
ALTER TABLE `call_logs` ADD `callerIdUsed` varchar(20);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ivrEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ivrOptions` json;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `abTestGroup` varchar(50);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `abTestVariant` varchar(10);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `targetStates` json;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `targetAreaCodes` json;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `useGeoCallerIds` int DEFAULT 0 NOT NULL;