CREATE TYPE "public"."inquiry_source" AS ENUM('web', 'tour_ai', 'tour_player');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('otel', 'apart', 'villa', 'butik', 'pansiyon', 'diger');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('beklemede', 'yayinda', 'reddedildi');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('beklemede', 'onaylandi', 'iptal', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('beklemede', 'odendi', 'iade', 'basarisiz');--> statement-breakpoint
CREATE TYPE "public"."message_sender_role" AS ENUM('guest', 'hotel', 'system');--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "latitude" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "longitude" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "property_type" "property_type" DEFAULT 'otel';--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "blackout_text" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "cancellation_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "gallery_urls" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "check_in" date;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "check_out" date;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "adults" integer;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "children" integer;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "room_slug" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "tour_id" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "step_key" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "source" "inquiry_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "locale" text DEFAULT 'tr';--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inquiries_access_token_unique" ON "inquiries" ("access_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inquiries_source_idx" ON "inquiries" ("source");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotel_gallery_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "room_id" uuid,
  "url" text NOT NULL,
  "caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotel_availability_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "start_date" date,
  "end_date" date,
  "label" text NOT NULL,
  "is_blackout" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cancellation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "free_until_days_before" integer,
  "penalty_percent" integer,
  "deposit_percent" integer,
  "custom_text" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "is_refundable" boolean DEFAULT true NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "board_type_override" text,
  "cancellation_rule_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_rate_plan_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL,
  "rate_plan_id" uuid NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "price_minor" integer NOT NULL,
  "currency" text DEFAULT 'TRY' NOT NULL,
  "min_stay_nights" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "discount_percent" integer NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "min_nights" integer,
  "room_ids" uuid[] DEFAULT '{}' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid,
  "hotel_slug" text,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inquiry_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid NOT NULL,
  "sender_role" "message_sender_role" NOT NULL,
  "sender_name" text,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "inquiry_id" uuid,
  "rating" integer NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "guest_name" text NOT NULL,
  "stay_date" date,
  "status" "review_status" DEFAULT 'beklemede' NOT NULL,
  "reply" text,
  "replied_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "hotel_id" uuid,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "room_id" uuid,
  "rate_plan_id" uuid,
  "inquiry_id" uuid,
  "guest_name" text NOT NULL,
  "guest_email" text NOT NULL,
  "guest_phone" text,
  "check_in" date NOT NULL,
  "check_out" date NOT NULL,
  "adults" integer DEFAULT 2 NOT NULL,
  "children" integer DEFAULT 0 NOT NULL,
  "status" "booking_status" DEFAULT 'beklemede' NOT NULL,
  "total_minor" integer,
  "currency" text DEFAULT 'TRY' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL,
  "hotel_id" uuid NOT NULL,
  "date" date NOT NULL,
  "allotment" integer DEFAULT 0 NOT NULL,
  "stop_sell" boolean DEFAULT false NOT NULL,
  "min_stay" integer,
  "cta" boolean DEFAULT false NOT NULL,
  "ctd" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid,
  "hotel_id" uuid NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'TRY' NOT NULL,
  "platform_fee_minor" integer DEFAULT 0 NOT NULL,
  "status" "payment_status" DEFAULT 'beklemede' NOT NULL,
  "provider" text,
  "provider_ref" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotel_ical_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "import_url" text,
  "export_token" text,
  "last_sync_at" timestamp,
  "last_sync_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "hotel_gallery_images" ADD CONSTRAINT "hotel_gallery_images_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_gallery_images" ADD CONSTRAINT "hotel_gallery_images_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_availability_notes" ADD CONSTRAINT "hotel_availability_notes_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_rules" ADD CONSTRAINT "cancellation_rules_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_cancellation_rule_id_cancellation_rules_id_fk" FOREIGN KEY ("cancellation_rule_id") REFERENCES "public"."cancellation_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate_plan_prices" ADD CONSTRAINT "room_rate_plan_prices_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate_plan_prices" ADD CONSTRAINT "room_rate_plan_prices_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rate_plan_prices" ADD CONSTRAINT "room_rate_plan_prices_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inventory" ADD CONSTRAINT "room_inventory_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_inventory" ADD CONSTRAINT "room_inventory_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_ical_feeds" ADD CONSTRAINT "hotel_ical_feeds_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_inventory_room_date_unique" ON "room_inventory" ("room_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hotel_ical_feeds_export_token_unique" ON "hotel_ical_feeds" ("export_token");
