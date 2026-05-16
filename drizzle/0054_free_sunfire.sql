CREATE TABLE `ip_blocklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`source` enum('fail2ban','manual','auto','rate_limit') NOT NULL,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`bannedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`unbannedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ip_blocklist_id` PRIMARY KEY(`id`),
	CONSTRAINT `ip_blocklist_ipAddress_unique` UNIQUE(`ipAddress`)
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` enum('login_success','login_failed','login_blocked','ip_banned','ip_unbanned','rate_limited','suspicious_request','password_reset','session_expired') NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`userAgent` text,
	`userId` int,
	`email` varchar(320),
	`details` json,
	`country` varchar(2),
	`city` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`)
);
