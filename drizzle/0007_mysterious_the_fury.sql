ALTER TABLE `campaigns` ADD `pacingMode` enum('fixed','adaptive','predictive') DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `pacingTargetDropRate` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `pacingMinConcurrent` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `pacingMaxConcurrent` int DEFAULT 10 NOT NULL;