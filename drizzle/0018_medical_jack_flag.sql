ALTER TABLE `campaigns` ADD `cpsLimit` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `pbx_agents` ADD `cpsLimit` int DEFAULT 3;