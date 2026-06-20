CREATE TABLE "room_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"min_stay_nights" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extras" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "extras" ADD COLUMN "discount_label" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "cancellation_policy" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "child_policy" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "pets_allowed" boolean;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "payment_methods" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "airport_distance_km" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "board_type" text DEFAULT 'sadece-oda' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "unit_count" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "min_stay_nights" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "pricing_notes" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discount_label" text;--> statement-breakpoint
ALTER TABLE "room_rates" ADD CONSTRAINT "room_rates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_rates" ADD CONSTRAINT "room_rates_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_rates_room_start_idx" ON "room_rates" USING btree ("room_id","start_date");--> statement-breakpoint
CREATE INDEX "room_rates_hotel_idx" ON "room_rates" USING btree ("hotel_id");