DROP INDEX "roles_company_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "roles_system_name_key" ON "roles" USING btree ("name") WHERE "roles"."company_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_name_key" ON "roles" USING btree ("company_id","name") WHERE "roles"."company_id" IS NOT NULL;