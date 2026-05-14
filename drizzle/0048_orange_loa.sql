CREATE TABLE `tts_audio_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`textHash` varchar(64) NOT NULL,
	`renderedText` text NOT NULL,
	`voice` varchar(100) NOT NULL,
	`provider` varchar(20) NOT NULL,
	`speed` varchar(10) NOT NULL DEFAULT '1.0',
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`durationMs` int,
	`hitCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tts_audio_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `dayPartScripts` json;