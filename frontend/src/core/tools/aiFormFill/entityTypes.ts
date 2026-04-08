/**
 * Typed entity system for AI Form Fill.
 * Replaces flat profile store with typed entities (person, company, site, etc.)
 */

export type EntityType =
  | 'person'
  | 'company'
  | 'site'
  | 'property'
  | 'certification'
  | 'custom';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  fields: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface EntityStoreData {
  version: 2;
  entities: Record<string, Entity>;
  defaultEntityId: string | null;
}

/** Schema hints per entity type — suggestive field names for autocomplete */
export const ENTITY_TYPE_HINTS: Record<EntityType, string[]> = {
  person: [
    'first_name', 'last_name', 'full_name', 'date_of_birth', 'email', 'phone',
    'address_line_1', 'address_line_2', 'city', 'state', 'postcode', 'country',
    'ni_number', 'nationality', 'gender', 'job_title',
  ],
  company: [
    'company_name', 'registration_number', 'tax_id', 'vat_number',
    'address_line_1', 'address_line_2', 'city', 'postcode', 'country',
    'phone', 'email', 'bank_sort_code', 'bank_account_number',
  ],
  site: [
    'site_name', 'address_line_1', 'address_line_2', 'city', 'postcode',
    'site_reference', 'description', 'client_name', 'start_date', 'end_date',
  ],
  property: [
    'address_line_1', 'address_line_2', 'city', 'postcode',
    'title_number', 'tenure', 'price', 'description',
  ],
  certification: [
    'cert_number', 'cert_name', 'issuer', 'holder_name',
    'issue_date', 'expiry_date',
  ],
  custom: [],
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  site: 'Site / Job',
  property: 'Property',
  certification: 'Certification',
  custom: 'Custom',
};

export const ENTITY_TYPE_ICONS: Record<EntityType, string> = {
  person: 'person',
  company: 'business',
  site: 'location_on',
  property: 'home',
  certification: 'verified',
  custom: 'category',
};

export const ALL_ENTITY_TYPES: EntityType[] = [
  'person', 'company', 'site', 'property', 'certification', 'custom',
];

/** Merge multiple entities into a single flat dict for the AI engine. */
export interface MergeResult {
  knowledge: Record<string, string>;
  provenance: Record<string, { entityId: string; entityName: string }>;
}

export function mergeEntitiesForFill(
  assignments: Array<{ roleLabel: string; entity: Entity }>
): MergeResult {
  const knowledge: Record<string, string> = {};
  const provenance: Record<string, { entityId: string; entityName: string }> = {};
  const multiEntity = assignments.length > 1;

  for (const { roleLabel, entity } of assignments) {
    const prefix = roleLabel.toLowerCase().replace(/\s+/g, '_');

    for (const [key, value] of Object.entries(entity.fields)) {
      if (key.startsWith('_')) continue;

      // Unprefixed: first writer wins
      if (!(key in knowledge)) {
        knowledge[key] = value;
        provenance[key] = { entityId: entity.id, entityName: entity.name };
      }

      // Always add prefixed version for multi-entity fills
      if (multiEntity) {
        const prefixedKey = `${prefix}_${key}`;
        knowledge[prefixedKey] = value;
        provenance[prefixedKey] = { entityId: entity.id, entityName: entity.name };
      }
    }
  }

  return { knowledge, provenance };
}
