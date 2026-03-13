ALTER TABLE `local_auth` ADD `verificationToken` varchar(255);--> statement-breakpoint
ALTER TABLE `local_auth` ADD `verificationTokenExpiry` bigint;