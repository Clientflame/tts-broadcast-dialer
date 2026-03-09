ALTER TABLE `pbx_agents` ADD `effectiveMaxCalls` int;--> statement-breakpoint
ALTER TABLE `pbx_agents` ADD `throttleReason` text;--> statement-breakpoint
ALTER TABLE `pbx_agents` ADD `throttleStartedAt` bigint;--> statement-breakpoint
ALTER TABLE `pbx_agents` ADD `throttleCarrierErrors` int DEFAULT 0 NOT NULL;