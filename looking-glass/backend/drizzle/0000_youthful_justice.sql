CREATE TABLE `leases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`ip_address` text NOT NULL,
	`hw_address` text NOT NULL,
	`hostname` text,
	`subnet_id` integer NOT NULL,
	`valid_lft` integer NOT NULL,
	`cltt` integer NOT NULL,
	`state` integer NOT NULL,
	`fqdn_fwd` integer DEFAULT 0 NOT NULL,
	`fqdn_rev` integer DEFAULT 0 NOT NULL,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leases_created` ON `leases` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leases_endpoint` ON `leases` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_leases_ip` ON `leases` (`ip_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `leases_endpoint_ip_address_hw_address_unique` ON `leases` (`endpoint`,`ip_address`,`hw_address`);