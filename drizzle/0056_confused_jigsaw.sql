ALTER TABLE `contacts` MODIFY COLUMN `status` enum('active','inactive','dnc','pif','rtv','rtp') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `contacts` ADD `phoneNumber2` varchar(20);--> statement-breakpoint
ALTER TABLE `contacts` ADD `creditorName` varchar(255);--> statement-breakpoint
ALTER TABLE `contacts` ADD `accountNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `contacts` ADD `originalBalance` int;--> statement-breakpoint
ALTER TABLE `contacts` ADD `currentBalance` int;--> statement-breakpoint
ALTER TABLE `contacts` ADD `placementDate` bigint;--> statement-breakpoint
ALTER TABLE `contacts` ADD `debtType` varchar(50);--> statement-breakpoint
ALTER TABLE `contacts` ADD `debtorStatus` varchar(50);--> statement-breakpoint
ALTER TABLE `contacts` ADD `lastPaymentDate` bigint;--> statement-breakpoint
ALTER TABLE `contacts` ADD `lastPaymentAmount` int;--> statement-breakpoint
ALTER TABLE `contacts` ADD `skipTraceStatus` varchar(20);