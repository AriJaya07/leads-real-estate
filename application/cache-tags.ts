/**
 * Cache tag vocabulary.
 *
 * Tags are per-dataset so syncing one dataset never invalidates another's
 * cached aggregates — which matters as soon as more than a couple of datasets
 * are active, since a global tag would make every sync a full cache wipe.
 */

export function leadsTag(): string {
  return "leads";
}

export function datasetTag(datasetId: string): string {
  return `dataset:${datasetId}`;
}

export function facetsTag(datasetId: string | null): string {
  return datasetId ? `facets:${datasetId}` : "facets:all";
}

export function datasetsRegistryTag(): string {
  return "datasets:registry";
}

export function leadTag(leadId: string): string {
  return `lead:${leadId}`;
}

export function actorTemplatesTag(): string {
  return "actor-templates";
}

export function scrapeRequestsTag(): string {
  return "scrape-requests";
}

export function alertRulesTag(): string {
  return "alert-rules";
}

export function savedViewsTag(): string {
  return "saved-views";
}

export function automationSettingsTag(companyId: string): string {
  return `automation-settings:${companyId}`;
}

export function automationRulesTag(): string {
  return "automation-rules";
}
