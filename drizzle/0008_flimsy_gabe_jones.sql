CREATE TABLE `call_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`campaignId` int,
	`callLogId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`channel` varchar(255) NOT NULL,
	`context` varchar(100) NOT NULL DEFAULT 'tts-broadcast',
	`callerIdStr` varchar(255),
	`audioUrl` text,
	`audioName` varchar(255),
	`variables` json,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`priority` int NOT NULL DEFAULT 5,
	`claimedBy` varchar(100),
	`claimedAt` bigint,
	`result` varchar(50),
	`resultDetails` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `call_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pbx_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(100) NOT NULL,
	`name` varchar(255),
	`apiKey` varchar(255) NOT NULL,
	`lastHeartbeat` bigint,
	`status` varchar(20) NOT NULL DEFAULT 'offline',
	`activeCalls` int DEFAULT 0,
	`maxCalls` int DEFAULT 5,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pbx_agents_id` PRIMARY KEY(`id`)
);
