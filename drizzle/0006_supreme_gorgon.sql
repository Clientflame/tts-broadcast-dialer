ALTER TABLE `campaigns` ADD `usePersonalizedTTS` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ttsSpeed` varchar(10) DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `useDidRotation` int DEFAULT 0 NOT NULL;