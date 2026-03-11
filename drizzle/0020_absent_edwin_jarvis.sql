ALTER TABLE `campaigns` MODIFY COLUMN `pacingMaxConcurrent` int NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE `pbx_agents` MODIFY COLUMN `maxCalls` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `pbx_agents` ADD `cpsPacingMs` int DEFAULT 1000;