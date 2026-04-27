/**
 * REST client for the server-side AI Form Fill workflow template store.
 */
import apiClient from '@app/services/apiClient';
import type { WorkflowTemplate } from './workflowTemplates';

interface ServerTemplateDTO {
  id: string;
  name: string;
  formSignature: string;
  roleEntityMap: Record<string, string> | null;
  fileOverrides: Record<string, Record<string, string>> | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function fromServer(dto: ServerTemplateDTO): WorkflowTemplate {
  return {
    id: dto.id,
    name: dto.name,
    formSignature: dto.formSignature,
    roleEntityMap: dto.roleEntityMap ?? {},
    fileOverrides: dto.fileOverrides ?? {},
    createdAt: Date.parse(dto.createdAt),
    lastUsedAt: dto.lastUsedAt ? Date.parse(dto.lastUsedAt) : Date.parse(dto.createdAt),
  };
}

export async function fetchWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const res = await apiClient.get<ServerTemplateDTO[]>(
    '/api/v1/ai-form-fill/workflow-templates',
    { suppressErrorToast: true } as any,
  );
  return (res.data ?? []).map(fromServer);
}

export async function upsertWorkflowTemplate(
  template: WorkflowTemplate,
): Promise<WorkflowTemplate> {
  const res = await apiClient.put<ServerTemplateDTO>(
    `/api/v1/ai-form-fill/workflow-templates/${encodeURIComponent(template.id)}`,
    {
      name: template.name,
      formSignature: template.formSignature,
      roleEntityMap: template.roleEntityMap,
      fileOverrides: template.fileOverrides,
    },
  );
  return fromServer(res.data);
}

export async function touchWorkflowTemplateRemote(id: string): Promise<WorkflowTemplate> {
  const res = await apiClient.post<ServerTemplateDTO>(
    `/api/v1/ai-form-fill/workflow-templates/${encodeURIComponent(id)}/touch`,
  );
  return fromServer(res.data);
}

export async function deleteWorkflowTemplateRemote(id: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/ai-form-fill/workflow-templates/${encodeURIComponent(id)}`,
  );
}
