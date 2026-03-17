ALTER TABLE `campaigns` ADD `routingMode` enum('broadcast','live_agent','hybrid') DEFAULT 'broadcast' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `powerDialRatio` varchar(10) DEFAULT '1.2';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `wrapUpTimeSecs` int DEFAULT 30 NOT NULL;