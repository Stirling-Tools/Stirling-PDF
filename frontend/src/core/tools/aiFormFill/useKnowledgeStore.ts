/**
 * Compatibility wrapper over useEntityStore.
 * Maps the old profile-based API to the new entity store.
 * Existing consumers (single-file flow) work unchanged.
 */
import { useCallback } from 'react';
import { useEntityStore, type EntityStore } from './useEntityStore';

export interface KnowledgeStore {
  profileNames: string[];
  activeProfileName: string;
  entries: Record<string, string>;
  entryCount: number;
  setActiveProfile: (name: string) => void;
  createProfile: (name: string) => void;
  renameProfile: (oldName: string, newName: string) => void;
  deleteProfile: (name: string) => void;
  set: (key: string, value: string) => void;
  setMany: (newEntries: Record<string, string>) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Access to the underlying entity store */
  entityStore: EntityStore;
}

export function useKnowledgeStore(): KnowledgeStore {
  const store = useEntityStore();

  const defaultEntity = store.defaultEntityId ? store.getEntity(store.defaultEntityId) : undefined;
  const entries = defaultEntity?.fields || {};

  const profileNames = store.entities.map((e) => e.name);
  const activeProfileName = defaultEntity?.name || '';

  const findByName = useCallback(
    (name: string) => store.entities.find((e) => e.name === name),
    [store.entities]
  );

  const setActiveProfile = useCallback(
    (name: string) => {
      const entity = findByName(name);
      if (entity) store.setDefaultEntity(entity.id);
    },
    [findByName, store.setDefaultEntity]
  );

  const createProfile = useCallback(
    (name: string) => {
      const entity = store.createEntity('person', name);
      store.setDefaultEntity(entity.id);
    },
    [store]
  );

  const renameProfile = useCallback(
    (oldName: string, newName: string) => {
      const entity = findByName(oldName);
      if (entity) store.updateEntity(entity.id, { name: newName });
    },
    [findByName, store.updateEntity]
  );

  const deleteProfile = useCallback(
    (name: string) => {
      const entity = findByName(name);
      if (entity) store.deleteEntity(entity.id);
    },
    [findByName, store.deleteEntity]
  );

  const set = useCallback(
    (key: string, value: string) => {
      if (store.defaultEntityId) store.setField(store.defaultEntityId, key, value);
    },
    [store.defaultEntityId, store.setField]
  );

  const setMany = useCallback(
    (newEntries: Record<string, string>) => {
      if (store.defaultEntityId) store.setManyFields(store.defaultEntityId, newEntries);
    },
    [store.defaultEntityId, store.setManyFields]
  );

  const remove = useCallback(
    (key: string) => {
      if (store.defaultEntityId) store.removeField(store.defaultEntityId, key);
    },
    [store.defaultEntityId, store.removeField]
  );

  const clear = useCallback(() => {
    if (store.defaultEntityId) store.clearFields(store.defaultEntityId);
  }, [store.defaultEntityId, store.clearFields]);

  return {
    profileNames,
    activeProfileName,
    entries,
    entryCount: Object.keys(entries).filter((k) => !k.startsWith('_')).length,
    setActiveProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    set,
    setMany,
    remove,
    clear,
    entityStore: store,
  };
}
