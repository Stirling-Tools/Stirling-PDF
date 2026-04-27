/**
 * Entity store — typed entity management.
 *
 * Authoritative state lives server-side (see FormFillEntityController) when the user is
 * logged in. localStorage remains the anonymous/offline fallback and first-paint cache so
 * the UI stays synchronous. Mutations update local state instantly and fire to the server
 * in the background; server failures don't block the UI.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@app/auth/UseSession';
import type { Entity, EntityType, EntityStoreData } from './entityTypes';
import {
  fetchEntities,
  upsertEntity as upsertEntityRemote,
  deleteEntityRemote,
  importEntities as importEntitiesRemote,
} from './entityApiClient';

const STORAGE_KEY = 'stirling-pdf-ai-profiles';

// --- v1 types for migration ---
interface V1StoredData {
  profiles: Record<string, Record<string, string>>;
  activeProfile: string;
}

function isV1Data(data: any): data is V1StoredData {
  return data && !data.version && data.profiles;
}

function migrateV1toV2(v1: V1StoredData): EntityStoreData {
  const entities: Record<string, Entity> = {};
  let defaultEntityId: string | null = null;

  for (const [profileName, entries] of Object.entries(v1.profiles)) {
    const id = crypto.randomUUID();
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(entries)) {
      if (!k.startsWith('_')) fields[k] = v;
    }
    entities[id] = {
      id,
      type: 'person',
      name: profileName,
      fields,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (profileName === v1.activeProfile) {
      defaultEntityId = id;
    }
  }

  if (!defaultEntityId && Object.keys(entities).length > 0) {
    defaultEntityId = Object.keys(entities)[0];
  }

  return { version: 2, entities, defaultEntityId };
}

function loadFromStorage(): EntityStoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isV1Data(parsed)) {
        const migrated = migrateV1toV2(parsed);
        saveToStorage(migrated);
        return migrated;
      }
      if (parsed.version === 2) return parsed;
    }
  } catch { /* ignore */ }

  // Default: empty store with one person entity
  const defaultId = crypto.randomUUID();
  return {
    version: 2,
    entities: {
      [defaultId]: {
        id: defaultId,
        type: 'person',
        name: 'Me',
        fields: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
    defaultEntityId: defaultId,
  };
}

function saveToStorage(data: EntityStoreData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* QuotaExceededError */ }
}

export interface EntityStore {
  /** All entities */
  entities: Entity[];
  /** Entity lookup by ID */
  getEntity: (id: string) => Entity | undefined;
  /** Entities grouped by type */
  entitiesByType: Record<EntityType, Entity[]>;
  /** Default entity ID */
  defaultEntityId: string | null;

  /** CRUD */
  createEntity: (type: EntityType, name: string) => Entity;
  updateEntity: (id: string, updates: Partial<Pick<Entity, 'name' | 'type'>>) => void;
  deleteEntity: (id: string) => void;
  duplicateEntity: (id: string, newName: string) => Entity;
  setDefaultEntity: (id: string) => void;

  /** Field operations on an entity */
  setField: (entityId: string, key: string, value: string) => void;
  setManyFields: (entityId: string, fields: Record<string, string>) => void;
  removeField: (entityId: string, key: string) => void;
  clearFields: (entityId: string) => void;

  /** For Select components — grouped data */
  selectData: Array<{ group: string; items: Array<{ value: string; label: string }> }>;
}

export function useEntityStore(): EntityStore {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [data, setData] = useState<EntityStoreData>(loadFromStorage);

  // Stable ref so async callbacks can read the latest state without re-binding.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Hydrate from server on login. Server wins over local when it has rows; if the server
  // is empty and local has entries, push local up as a one-shot migration.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchEntities();
        if (cancelled) return;
        if (remote.length > 0) {
          const entities: Record<string, Entity> = {};
          for (const e of remote) entities[e.id] = e;
          const localDefault = dataRef.current.defaultEntityId;
          const defaultEntityId =
            localDefault && entities[localDefault]
              ? localDefault
              : remote[0]?.id ?? null;
          const next: EntityStoreData = { version: 2, entities, defaultEntityId };
          setData(next);
          saveToStorage(next);
        } else {
          const localEntities = Object.values(dataRef.current.entities);
          if (localEntities.length > 0) {
            importEntitiesRemote(localEntities).catch(() => {});
          }
        }
      } catch {
        /* offline or server unavailable — keep local state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const update = useCallback((fn: (prev: EntityStoreData) => EntityStoreData) => {
    setData((prev) => {
      const next = fn(prev);
      saveToStorage(next);
      return next;
    });
  }, []);

  const syncEntity = useCallback(
    (entity: Entity) => {
      if (!isAuthenticated) return;
      upsertEntityRemote(entity).catch(() => {});
    },
    [isAuthenticated],
  );

  const syncDelete = useCallback(
    (id: string) => {
      if (!isAuthenticated) return;
      deleteEntityRemote(id).catch(() => {});
    },
    [isAuthenticated],
  );

  const entities = useMemo(() => Object.values(data.entities), [data.entities]);

  const getEntity = useCallback(
    (id: string) => data.entities[id],
    [data.entities]
  );

  const entitiesByType = useMemo(() => {
    const grouped: Record<EntityType, Entity[]> = {
      person: [], company: [], site: [], property: [], certification: [], custom: [],
    };
    for (const e of entities) {
      grouped[e.type].push(e);
    }
    return grouped;
  }, [entities]);

  const createEntity = useCallback((type: EntityType, name: string): Entity => {
    const entity: Entity = {
      id: crypto.randomUUID(),
      type,
      name,
      fields: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((prev) => ({
      ...prev,
      entities: { ...prev.entities, [entity.id]: entity },
    }));
    syncEntity(entity);
    return entity;
  }, [update, syncEntity]);

  const updateEntity = useCallback((id: string, updates: Partial<Pick<Entity, 'name' | 'type'>>) => {
    let updated: Entity | undefined;
    update((prev) => {
      const entity = prev.entities[id];
      if (!entity) return prev;
      updated = { ...entity, ...updates, updatedAt: Date.now() };
      return {
        ...prev,
        entities: { ...prev.entities, [id]: updated },
      };
    });
    if (updated) syncEntity(updated);
  }, [update, syncEntity]);

  const deleteEntity = useCallback((id: string) => {
    update((prev) => {
      const { [id]: _, ...rest } = prev.entities;
      const remaining = Object.keys(rest);
      return {
        ...prev,
        entities: rest,
        defaultEntityId: prev.defaultEntityId === id
          ? (remaining[0] || null)
          : prev.defaultEntityId,
      };
    });
    syncDelete(id);
  }, [update, syncDelete]);

  const duplicateEntity = useCallback((id: string, newName: string): Entity => {
    const source = data.entities[id];
    const entity: Entity = {
      id: crypto.randomUUID(),
      type: source?.type || 'custom',
      name: newName,
      fields: { ...(source?.fields || {}) },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((prev) => ({
      ...prev,
      entities: { ...prev.entities, [entity.id]: entity },
    }));
    syncEntity(entity);
    return entity;
  }, [data.entities, update, syncEntity]);

  const setDefaultEntity = useCallback((id: string) => {
    update((prev) => ({ ...prev, defaultEntityId: id }));
  }, [update]);

  const setField = useCallback((entityId: string, key: string, value: string) => {
    let updated: Entity | undefined;
    update((prev) => {
      const entity = prev.entities[entityId];
      if (!entity) return prev;
      updated = {
        ...entity,
        fields: { ...entity.fields, [key]: value },
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        entities: { ...prev.entities, [entityId]: updated },
      };
    });
    if (updated) syncEntity(updated);
  }, [update, syncEntity]);

  const setManyFields = useCallback((entityId: string, fields: Record<string, string>) => {
    let updated: Entity | undefined;
    update((prev) => {
      const entity = prev.entities[entityId];
      if (!entity) return prev;
      updated = {
        ...entity,
        fields: { ...entity.fields, ...fields },
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        entities: { ...prev.entities, [entityId]: updated },
      };
    });
    if (updated) syncEntity(updated);
  }, [update, syncEntity]);

  const removeField = useCallback((entityId: string, key: string) => {
    let updated: Entity | undefined;
    update((prev) => {
      const entity = prev.entities[entityId];
      if (!entity) return prev;
      const fields = { ...entity.fields };
      delete fields[key];
      updated = { ...entity, fields, updatedAt: Date.now() };
      return {
        ...prev,
        entities: { ...prev.entities, [entityId]: updated },
      };
    });
    if (updated) syncEntity(updated);
  }, [update, syncEntity]);

  const clearFields = useCallback((entityId: string) => {
    let updated: Entity | undefined;
    update((prev) => {
      const entity = prev.entities[entityId];
      if (!entity) return prev;
      updated = { ...entity, fields: {}, updatedAt: Date.now() };
      return {
        ...prev,
        entities: { ...prev.entities, [entityId]: updated },
      };
    });
    if (updated) syncEntity(updated);
  }, [update, syncEntity]);

  const selectData = useMemo(() => {
    const groups: Array<{ group: string; items: Array<{ value: string; label: string }> }> = [];
    const typeLabels: Record<EntityType, string> = {
      person: 'People', company: 'Companies', site: 'Sites / Jobs',
      property: 'Properties', certification: 'Certifications', custom: 'Custom',
    };
    for (const [type, label] of Object.entries(typeLabels)) {
      const items = entitiesByType[type as EntityType];
      if (items.length > 0) {
        groups.push({
          group: label,
          items: items.map((e) => ({ value: e.id, label: e.name })),
        });
      }
    }
    return groups;
  }, [entitiesByType]);

  return {
    entities,
    getEntity,
    entitiesByType,
    defaultEntityId: data.defaultEntityId,
    createEntity,
    updateEntity,
    deleteEntity,
    duplicateEntity,
    setDefaultEntity,
    setField,
    setManyFields,
    removeField,
    clearFields,
    selectData,
  };
}
