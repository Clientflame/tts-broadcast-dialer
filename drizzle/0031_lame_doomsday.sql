CREATE TABLE `assist_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentId` int NOT NULL,
	`callLogId` int,
	`campaignId` int,
	`contactId` int,
	`contactName` varchar(200),
	`contactPhone` varchar(20),
	`status` enum('active','paused','ended') NOT NULL DEFAULT 'active',
	`callStage` enum('greeting','verification','discovery','presentation','objection','negotiation','closing','wrap_up') NOT NULL DEFAULT 'greeting',
	`sentimentScore` varchar(10),
	`sentimentLabel` enum('very_negative','negative','neutral','positive','very_positive') DEFAULT 'neutral',
	`totalSuggestions` int NOT NULL DEFAULT 0,
	`acceptedSuggestions` int NOT NULL DEFAULT 0,
	`dismissedSuggestions` int NOT NULL DEFAULT 0,
	`startedAt` bigint NOT NULL,
	`endedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assist_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assist_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`templateId` int,
	`type` enum('talk_track','objection_handle','compliance_alert','next_action','sentiment_alert','closing_cue','de_escalation','info_card') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`triggerContext` text,
	`status` enum('pending','accepted','dismissed','expired') NOT NULL DEFAULT 'pending',
	`respondedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assist_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coaching_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('objection_handling','compliance','closing','rapport_building','payment_negotiation','de_escalation','general') NOT NULL DEFAULT 'general',
	`triggers` json,
	`suggestions` json,
	`isActive` int NOT NULL DEFAULT 1,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coaching_templates_id` PRIMARY KEY(`id`)
);
