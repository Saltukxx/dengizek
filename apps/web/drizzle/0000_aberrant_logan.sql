CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country" text,
	"short_description" text,
	"long_description" text,
	"image_url" text,
	"price_label" text,
	"ai_persona" text DEFAULT 'Yapay Zeka Rehberi' NOT NULL,
	"ai_language" text DEFAULT 'tr' NOT NULL,
	"ai_facts" text[] DEFAULT '{}' NOT NULL,
	"ai_policies" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tour_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_slug" text NOT NULL,
	"tour_id" text NOT NULL,
	"step_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"order_index" integer NOT NULL,
	"requires_user_continue" boolean DEFAULT false NOT NULL,
	"body" text,
	"media_url" text NOT NULL,
	"media" jsonb NOT NULL,
	"captions_vtt_url" text,
	"narration_url" text,
	"step_key" text,
	"branches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"callouts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hotspots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_tags" text[] DEFAULT '{}' NOT NULL,
	"ai_description" text,
	"ai_promo" text[] DEFAULT '{}' NOT NULL,
	"ai_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tour_steps" ADD CONSTRAINT "tour_steps_hotel_slug_hotels_slug_fk" FOREIGN KEY ("hotel_slug") REFERENCES "public"."hotels"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hotel_tour_idx" ON "tour_steps" USING btree ("hotel_slug","tour_id");