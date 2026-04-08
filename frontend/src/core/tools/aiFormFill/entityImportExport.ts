/**
 * Entity import/export utilities.
 * JSON export/import for backup, CSV import for bulk entity creation.
 */
import type { Entity, EntityType, EntityStoreData } from './entityTypes';
import type { EntityStore } from './useEntityStore';

// --- JSON Export/Import ---

export function exportEntitiesToJson(entities: Entity[]): string {
  return JSON.stringify({ entities, exportedAt: new Date().toISOString() }, null, 2);
}

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function importEntitiesFromJson(
  jsonString: string,
  store: EntityStore
): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;

  try {
    const parsed = JSON.parse(jsonString);
    const entities: any[] = parsed.entities || [];

    for (const e of entities) {
      if (!e.name || !e.type || !e.fields) {
        errors.push(`Skipped invalid entity: ${JSON.stringify(e).slice(0, 50)}`);
        continue;
      }
      const entity = store.createEntity(e.type as EntityType, e.name);
      store.setManyFields(entity.id, e.fields);
      imported++;
    }
  } catch (err) {
    errors.push(`Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return { imported, errors };
}

// --- CSV Import ---

/**
 * Parse CSV text into entities.
 * Expected format: first row is headers, first column is entity name,
 * remaining columns are field keys. Each row becomes one entity.
 *
 * Example:
 * name,first_name,last_name,email,phone
 * John Smith,John,Smith,john@example.com,555-1234
 * Jane Doe,Jane,Doe,jane@example.com,555-5678
 */
export function parseCsvToEntities(
  csvText: string,
  entityType: EntityType = 'person'
): { entities: Array<{ name: string; type: EntityType; fields: Record<string, string> }>; errors: string[] } {
  const errors: string[] = [];
  const lines = csvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length < 2) {
    errors.push('CSV must have at least a header row and one data row.');
    return { entities: [], errors };
  }

  const headers = parseCSVLine(lines[0]);
  const nameColIndex = headers.findIndex((h) => h.toLowerCase() === 'name');
  if (nameColIndex === -1) {
    errors.push('CSV must have a "name" column.');
    return { entities: [], errors };
  }

  const entities: Array<{ name: string; type: EntityType; fields: Record<string, string> }> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${values.length}. Skipped.`);
      continue;
    }

    const name = values[nameColIndex];
    if (!name) {
      errors.push(`Row ${i + 1}: empty name. Skipped.`);
      continue;
    }

    const fields: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (j === nameColIndex) continue;
      const key = headers[j].trim().toLowerCase().replace(/\s+/g, '_');
      const value = values[j]?.trim() || '';
      if (value) fields[key] = value;
    }

    entities.push({ name, type: entityType, fields });
  }

  return { entities, errors };
}

export function importCsvToStore(
  csvText: string,
  entityType: EntityType,
  store: EntityStore
): { imported: number; errors: string[] } {
  const { entities, errors } = parseCsvToEntities(csvText, entityType);
  let imported = 0;

  for (const e of entities) {
    const existing = store.entities.find((ex) => ex.name === e.name && ex.type === e.type);
    if (existing) {
      store.setManyFields(existing.id, e.fields);
    } else {
      const entity = store.createEntity(e.type, e.name);
      store.setManyFields(entity.id, e.fields);
    }
    imported++;
  }

  return { imported, errors };
}

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// --- Same-Template-Different-Data Batch ---

/**
 * Generate N copies of fill requests — one per entity — for the same form template.
 * Used when filling the same form for multiple people (e.g. pension enrollment for 5 employees).
 */
export function generateTemplateBatch(
  templateFields: Array<{ name: string; label: string; type: string }>,
  entityIds: string[],
  store: EntityStore
): Array<{ entityId: string; entityName: string; knowledge: Record<string, string> }> {
  return entityIds.map((id) => {
    const entity = store.getEntity(id);
    return {
      entityId: id,
      entityName: entity?.name || id,
      knowledge: entity?.fields || {},
    };
  });
}
