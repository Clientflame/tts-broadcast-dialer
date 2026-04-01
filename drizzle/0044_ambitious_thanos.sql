CREATE TABLE `security_grade_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grade` varchar(2) NOT NULL,
	`okCount` int NOT NULL,
	`warningCount` int NOT NULL,
	`errorCount` int NOT NULL,
	`unconfiguredCount` int NOT NULL,
	`totalChecks` int NOT NULL,
	`details` json,
	`checkedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_grade_history_id` PRIMARY KEY(`id`)
);
