CREATE TABLE `agent_call_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`userId` int NOT NULL,
	`campaignId` int,
	`callQueueId` int,
	`callLogId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`contactName` varchar(200),
	`connectedAt` bigint,
	`disconnectedAt` bigint,
	`talkDuration` int,
	`holdDuration` int,
	`wrapUpDuration` int,
	`disposition` enum('connected','promise_to_pay','payment_made','callback_requested','wrong_number','deceased','disputed','refused_to_pay','no_contact','left_message','other') DEFAULT 'connected',
	`wrapUpNotes` text,
	`wrapUpCode` varchar(50),
	`wasTransferred` int DEFAULT 0,
	`transferredTo` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_call_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`userId` int NOT NULL,
	`sessionType` enum('login','logout','break_start','break_end','status_change') NOT NULL,
	`previousStatus` varchar(20),
	`newStatus` varchar(20),
	`campaignId` int,
	`ipAddress` varchar(45),
	`durationSecs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_agent_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`agentId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_agent_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `live_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`sipExtension` varchar(20) NOT NULL,
	`sipPassword` varchar(255),
	`email` varchar(320),
	`status` enum('offline','available','ringing','on_call','wrap_up','on_break','reserved') NOT NULL DEFAULT 'offline',
	`currentCallId` int,
	`currentCampaignId` int,
	`statusChangedAt` bigint,
	`skills` json,
	`priority` int NOT NULL DEFAULT 5,
	`maxConcurrentCalls` int NOT NULL DEFAULT 1,
	`totalCallsHandled` int NOT NULL DEFAULT 0,
	`totalTalkTime` int NOT NULL DEFAULT 0,
	`totalWrapTime` int NOT NULL DEFAULT 0,
	`avgHandleTime` int NOT NULL DEFAULT 0,
	`lastLoginAt` bigint,
	`lastLogoutAt` bigint,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_agents_id` PRIMARY KEY(`id`)
);
