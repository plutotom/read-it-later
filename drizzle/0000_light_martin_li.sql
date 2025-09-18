CREATE TABLE `jess-app_account` (
	`userId` text(255) NOT NULL,
	`type` text(255) NOT NULL,
	`provider` text(255) NOT NULL,
	`providerAccountId` text(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text(255),
	`scope` text(255),
	`id_token` text,
	`session_state` text(255),
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `jess-app_account` (`userId`);--> statement-breakpoint
CREATE TABLE `jess-app_application` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jobId` integer NOT NULL,
	`candidateId` text(255) NOT NULL,
	`status` text(20) DEFAULT 'submitted' NOT NULL,
	`answersJson` text,
	`matchScore` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`jobId`) REFERENCES `jess-app_job`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidateId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `application_job_idx` ON `jess-app_application` (`jobId`);--> statement-breakpoint
CREATE INDEX `application_candidate_idx` ON `jess-app_application` (`candidateId`);--> statement-breakpoint
CREATE TABLE `jess-app_candidate_profile` (
	`userId` text(255) PRIMARY KEY NOT NULL,
	`headline` text(255),
	`location` text(255),
	`bio` text,
	`workPreference` text(20),
	`compMin` integer,
	`compMax` integer,
	`workAuth` text(255),
	`visibility` text(20) DEFAULT 'private' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jess-app_candidate_value` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidateId` text(255) NOT NULL,
	`value` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`candidateId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `candidate_value_candidate_idx` ON `jess-app_candidate_value` (`candidateId`);--> statement-breakpoint
CREATE TABLE `jess-app_company` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ownerId` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`size` text(100),
	`industry` text(100),
	`locationsJson` text,
	`benefitsSnapshot` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`ownerId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `company_owner_idx` ON `jess-app_company` (`ownerId`);--> statement-breakpoint
CREATE INDEX `company_name_idx` ON `jess-app_company` (`name`);--> statement-breakpoint
CREATE TABLE `jess-app_company_post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`companyId` integer NOT NULL,
	`content` text NOT NULL,
	`mediaUrlsJson` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `jess-app_company`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `company_post_company_idx` ON `jess-app_company_post` (`companyId`);--> statement-breakpoint
CREATE TABLE `jess-app_company_value` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`companyId` integer NOT NULL,
	`value` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `jess-app_company`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `company_value_company_idx` ON `jess-app_company_value` (`companyId`);--> statement-breakpoint
CREATE TABLE `jess-app_job_question` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jobId` integer NOT NULL,
	`questionText` text NOT NULL,
	`required` integer DEFAULT 1 NOT NULL,
	`answerType` text(20) DEFAULT 'text' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`jobId`) REFERENCES `jess-app_job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_question_job_idx` ON `jess-app_job_question` (`jobId`);--> statement-breakpoint
CREATE TABLE `jess-app_job` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`companyId` integer NOT NULL,
	`title` text(255) NOT NULL,
	`description` text NOT NULL,
	`mustHavesJson` text,
	`niceToHavesJson` text,
	`compMin` integer,
	`compMax` integer,
	`locationType` text(20),
	`locationsJson` text,
	`status` text(20) DEFAULT 'open' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`companyId`) REFERENCES `jess-app_company`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_company_idx` ON `jess-app_job` (`companyId`);--> statement-breakpoint
CREATE TABLE `jess-app_post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256),
	`createdById` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdById`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `created_by_idx` ON `jess-app_post` (`createdById`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `jess-app_post` (`name`);--> statement-breakpoint
CREATE TABLE `jess-app_resume` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidateId` text(255) NOT NULL,
	`fileUrl` text(1024) NOT NULL,
	`detailsJson` text,
	`isPrimary` integer DEFAULT 1 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`candidateId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resume_candidate_idx` ON `jess-app_resume` (`candidateId`);--> statement-breakpoint
CREATE TABLE `jess-app_session` (
	`sessionToken` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `jess-app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `jess-app_session` (`userId`);--> statement-breakpoint
CREATE TABLE `jess-app_user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`emailVerified` integer DEFAULT (unixepoch()),
	`image` text(255),
	`role` text(20) DEFAULT 'candidate' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jess-app_verification_token` (
	`identifier` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
