CREATE TABLE "hotel_panel_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotel_panel_revisions" ADD CONSTRAINT "hotel_panel_revisions_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_panel_revisions" ADD CONSTRAINT "hotel_panel_revisions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_panel_revisions_hotel_scope_unique" ON "hotel_panel_revisions" USING btree ("hotel_id","scope");
--> statement-breakpoint
CREATE INDEX "hotel_panel_revisions_hotel_idx" ON "hotel_panel_revisions" USING btree ("hotel_id");
