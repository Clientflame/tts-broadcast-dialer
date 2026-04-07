CREATE TABLE `voicemail_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`text` text NOT NULL,
	`voice` varchar(100) NOT NULL,
	`provider` enum('openai','google') NOT NULL,
	`speed` varchar(10) NOT NULL DEFAULT '1.0',
	`format` enum('mp3','wav') NOT NULL,
	`s3Url` text NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`fileSize` int NOT NULL DEFAULT 0,
	`duration` int,
	`pbxUploaded` int NOT NULL DEFAULT 0,
	`pbxPath` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voicemail_library_id` PRIMARY KEY(`id`)
);
