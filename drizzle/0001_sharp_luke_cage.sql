CREATE TABLE `audio_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`text` text NOT NULL,
	`voice` varchar(50) NOT NULL,
	`s3Url` text,
	`s3Key` varchar(512),
	`duration` int,
	`fileSize` int,
	`status` enum('generating','ready','failed') NOT NULL DEFAULT 'generating',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audio_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(255),
	`action` varchar(100) NOT NULL,
	`resource` varchar(100) NOT NULL,
	`resourceId` int,
	`details` json,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `call_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`contactName` varchar(200),
	`status` enum('pending','dialing','ringing','answered','busy','no-answer','failed','completed','cancelled') NOT NULL DEFAULT 'pending',
	`duration` int,
	`attempt` int NOT NULL DEFAULT 1,
	`asteriskChannel` varchar(255),
	`asteriskCallId` varchar(255),
	`errorMessage` text,
	`dtmfResponse` varchar(10),
	`startedAt` bigint,
	`answeredAt` bigint,
	`endedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`contactListId` int NOT NULL,
	`audioFileId` int,
	`messageText` text,
	`voice` varchar(50) DEFAULT 'alloy',
	`callerIdNumber` varchar(20),
	`callerIdName` varchar(100),
	`status` enum('draft','scheduled','running','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
	`maxConcurrentCalls` int NOT NULL DEFAULT 1,
	`retryAttempts` int NOT NULL DEFAULT 0,
	`retryDelay` int NOT NULL DEFAULT 300,
	`scheduledAt` bigint,
	`timezone` varchar(64) DEFAULT 'America/New_York',
	`timeWindowStart` varchar(5) DEFAULT '09:00',
	`timeWindowEnd` varchar(5) DEFAULT '21:00',
	`totalContacts` int NOT NULL DEFAULT 0,
	`completedCalls` int NOT NULL DEFAULT 0,
	`answeredCalls` int NOT NULL DEFAULT 0,
	`failedCalls` int NOT NULL DEFAULT 0,
	`startedAt` bigint,
	`completedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`contactCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`firstName` varchar(100),
	`lastName` varchar(100),
	`email` varchar(320),
	`company` varchar(255),
	`customFields` json,
	`status` enum('active','inactive','dnc') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
