ALTER TABLE `campaigns` ADD `recordingEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `recordingRetentionDays` int DEFAULT 90 NOT NULL;