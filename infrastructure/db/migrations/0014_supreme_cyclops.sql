CREATE INDEX "lead_events_company_type_idx" ON "lead_events" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "lead_events_company_at_idx" ON "lead_events" USING btree ("company_id","at");--> statement-breakpoint
CREATE INDEX "lead_states_company_status_updated_idx" ON "lead_states" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "lead_states_company_deal_closed_idx" ON "lead_states" USING btree ("company_id","deal_closed_at") WHERE "lead_states"."status" = 'closed';