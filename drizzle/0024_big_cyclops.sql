CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`campaignId` int,
	`callLogId` int,
	`contactId` int,
	`phoneNumber` varchar(20) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'usd',
	`status` enum('pending','processing','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
	`stripePaymentIntentId` varchar(255),
	`stripeCustomerId` varchar(255),
	`paymentMethod` varchar(50),
	`last4` varchar(4),
	`errorMessage` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `call_logs` ADD `amdResult` varchar(20);--> statement-breakpoint
ALTER TABLE `call_logs` ADD `voicemailDropped` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `amdEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `voicemailAudioFileId` int;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `voicemailMessageText` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `enforceContactTimezone` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `contactTzWindowStart` varchar(5) DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `contactTzWindowEnd` varchar(5) DEFAULT '21:00';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ivrPaymentEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ivrPaymentAmountField` varchar(100);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ivrPaymentDigit` varchar(2) DEFAULT '1';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `predictiveAgentCount` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `predictiveTargetWaitTime` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `predictiveMaxAbandonRate` int DEFAULT 3 NOT NULL;