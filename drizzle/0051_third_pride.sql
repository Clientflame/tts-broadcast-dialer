CREATE TABLE `api_request_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apiKeyId` int NOT NULL,
	`method` varchar(10) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`statusCode` int NOT NULL,
	`responseTimeMs` int,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_request_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`keyPrefix` varchar(10) NOT NULL,
	`keyHash` varchar(128) NOT NULL,
	`permissions` json,
	`rateLimit` int NOT NULL DEFAULT 60,
	`lastUsedAt` bigint,
	`expiresAt` bigint,
	`isActive` int NOT NULL DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_api_keys_keyHash_unique` UNIQUE(`keyHash`)
);
