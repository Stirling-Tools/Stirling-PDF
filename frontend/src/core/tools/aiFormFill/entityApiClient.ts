/**
 * REST client for the server-side AI Form Fill entity store.
 * The server owns authoritative state; localStorage is the anonymous/offline fallback.
 */
import apiClient from '@app/services/apiClient';
import type { Entity, EntityType } from './entityTypes';

interface ServerEntityDTO {
  id: string;
  type: string;
  name: string;
  fields: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

function fromServer(dto: ServerEntityDTO): Entity {
  return {
    id: dto.id,
    type: (dto.type as EntityType) ?? 'custom',
    name: dto.name,
    fields: dto.fields ?? {},
    createdAt: Date.parse(dto.createdAt),
    updatedAt: Date.parse(dto.updatedAt),
  };
}

export async function fetchEntities(): Promise<Entity[]> {
  const res = await apiClient.get<ServerEntityDTO[]>(
    '/api/v1/ai-form-fill/entities',
    { suppressErrorToast: true } as any,
  );
  return (res.data ?? []).map(fromServer);
}

export async function upsertEntity(entity: Entity): Promise<Entity> {
  const res = await apiClient.put<ServerEntityDTO>(
    `/api/v1/ai-form-fill/entities/${encodeURIComponent(entity.id)}`,
    {
      type: entity.type,
      name: entity.name,
      fields: entity.fields,
    },
  );
  return fromServer(res.data);
}

export async function deleteEntityRemote(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/ai-form-fill/entities/${encodeURIComponent(id)}`);
}

export async function importEntities(entities: Entity[]): Promise<Entity[]> {
  if (entities.length === 0) return [];
  const res = await apiClient.post<ServerEntityDTO[]>(
    '/api/v1/ai-form-fill/entities/import',
    {
      entities: entities.map((e) => ({
        id: e.id,
        entity: { type: e.type, name: e.name, fields: e.fields },
      })),
    },
  );
  return (res.data ?? []).map(fromServer);
}
