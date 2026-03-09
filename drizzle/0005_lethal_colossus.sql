CREATE TABLE `local_auth` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`isVerified` int NOT NULL DEFAULT 0,
	`resetToken` varchar(255),
	`resetTokenExpiry` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_auth_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_auth_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `user_group_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_group_memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`permissions` json,
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_groups_name_unique` UNIQUE(`name`)
);
