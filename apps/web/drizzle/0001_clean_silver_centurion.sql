CREATE TYPE "public"."inquiry_status" AS ENUM('yeni', 'ilgileniliyor', 'kapatildi');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('yuklendi', 'isleniyor', 'hazir', 'hata', 'yayinlandi');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image', 'vtt');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('taslak', 'incelemede', 'yayinda', 'reddedildi');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid,
	"hotel_slug" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"status" "inquiry_status" DEFAULT 'yeni' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"type" "media_type" NOT NULL,
	"status" "media_status" DEFAULT 'yuklendi' NOT NULL,
	"title" text NOT NULL,
	"bunny_video_guid" text,
	"playback_url" text,
	"thumbnail_url" text,
	"duration_sec" integer,
	"size_bytes" integer,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_bunny_video_guid_unique" UNIQUE("bunny_video_guid")
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"hotel_slug" text NOT NULL,
	"tour_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "moderation_status" DEFAULT 'taslak' NOT NULL,
	"moderation_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"published_manifest" jsonb,
	"published_at" timestamp,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'manager' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "status" "moderation_status" DEFAULT 'taslak' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "moderation_note" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_members" ADD CONSTRAINT "hotel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_members" ADD CONSTRAINT "hotel_members_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_members_user_hotel_unique" ON "hotel_members" USING btree ("user_id","hotel_id");--> statement-breakpoint
CREATE INDEX "hotel_members_hotel_idx" ON "hotel_members" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "inquiries_hotel_status_idx" ON "inquiries" USING btree ("hotel_id","status");--> statement-breakpoint
CREATE INDEX "media_assets_hotel_idx" ON "media_assets" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tours_hotel_slug_tour_unique" ON "tours" USING btree ("hotel_slug","tour_id");--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;