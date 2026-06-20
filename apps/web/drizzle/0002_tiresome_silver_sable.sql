CREATE TABLE "extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'diger' NOT NULL,
	"unit_label" text,
	"image_url" text,
	"price_minor" integer,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"price_on_request" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cuisine" text,
	"hours" text,
	"location" text,
	"image_url" text,
	"menu" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"size_sqm" integer,
	"capacity_adults" integer DEFAULT 2 NOT NULL,
	"capacity_children" integer DEFAULT 0 NOT NULL,
	"bed_config" text,
	"view_type" text,
	"image_url" text,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"price_minor" integer,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"price_on_request" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "star_rating" integer;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "total_rooms" integer;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "check_in_time" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "check_out_time" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "extras" ADD CONSTRAINT "extras_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extras_hotel_idx" ON "extras" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "restaurants_hotel_idx" ON "restaurants" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hotel_slug_unique" ON "rooms" USING btree ("hotel_id","slug");--> statement-breakpoint
CREATE INDEX "rooms_hotel_idx" ON "rooms" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tour_steps_hotel_tour_step_unique" ON "tour_steps" USING btree ("hotel_slug","tour_id","step_id");