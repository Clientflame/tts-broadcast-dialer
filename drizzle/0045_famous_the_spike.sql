CREATE TABLE `crm_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('vtiger','salesforce','hubspot','zoho','custom') NOT NULL DEFAULT 'vtiger',
	`name` varchar(255) NOT NULL,
	`apiUrl` text,
	`apiUsername` varchar(255),
	`apiKeyField` varchar(100) DEFAULT 'crm_api_key',
	`isActive` int NOT NULL DEFAULT 1,
	`lastSyncAt` bigint,
	`lastSyncStatus` varchar(50),
	`lastSyncError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbound_filter_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`didNumber` varchar(20) NOT NULL,
	`callerNumber` varchar(20) NOT NULL,
	`action` enum('allowed','rejected','bypassed') NOT NULL,
	`reason` varchar(255),
	`matchSource` varchar(50),
	`filterRuleId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbound_filter_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbound_filter_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`messageText` text NOT NULL,
	`voice` varchar(50) DEFAULT 'en-US-Wavenet-F',
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_filter_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbound_filter_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`callerIdId` int NOT NULL,
	`didNumber` varchar(20) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`filterMode` enum('whitelist','blacklist','both') NOT NULL DEFAULT 'whitelist',
	`checkInternalContacts` int NOT NULL DEFAULT 1,
	`checkExternalCrm` int NOT NULL DEFAULT 0,
	`checkManualWhitelist` int NOT NULL DEFAULT 1,
	`rejectionMessageId` int,
	`totalFiltered` int NOT NULL DEFAULT 0,
	`totalAllowed` int NOT NULL DEFAULT 0,
	`lastFilteredAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_filter_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phone_blacklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`name` varchar(255),
	`reason` varchar(255),
	`addedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phone_blacklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phone_whitelist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`name` varchar(255),
	`reason` varchar(255),
	`addedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phone_whitelist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `caller_ids` ADD `isMerchant` int DEFAULT 0 NOT NULL;