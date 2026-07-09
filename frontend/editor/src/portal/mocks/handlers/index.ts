import { assistantHandlers } from "@portal/mocks/handlers/assistant";
import { authHandlers } from "@portal/mocks/handlers/auth";
import { homeHandlers } from "@portal/mocks/handlers/home";
import { notificationsHandlers } from "@portal/mocks/handlers/notifications";
import { opsHandlers } from "@portal/mocks/handlers/ops";
import { searchHandlers } from "@portal/mocks/handlers/search";
import { pipelinesHandlers } from "@portal/mocks/handlers/pipelines";
import { sourcesHandlers } from "@portal/mocks/handlers/sources";
import { infrastructureHandlers } from "@portal/mocks/handlers/infrastructure";
import { procurementHandlers } from "@portal/mocks/handlers/procurement";
import { procurementSaasHandlers } from "@portal/mocks/handlers/procurementSaas";
import { docsHandlers } from "@portal/mocks/handlers/docs";
import { usersHandlers } from "@portal/mocks/handlers/users";
import { agentsHandlers } from "@portal/mocks/handlers/agents";
import { policiesHandlers } from "@portal/mocks/handlers/policies";
import { documentsHandlers } from "@portal/mocks/handlers/documents";
import { sdkComponentsHandlers } from "@portal/mocks/handlers/sdkComponents";
import { editorDeployHandlers } from "@portal/mocks/handlers/editorDeploy";
import { linkHandlers } from "@portal/mocks/handlers/link";

export const handlers = [
  ...authHandlers,
  ...homeHandlers,
  ...opsHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
  ...searchHandlers,
  ...pipelinesHandlers,
  ...sourcesHandlers,
  ...infrastructureHandlers,
  ...docsHandlers,
  ...procurementHandlers,
  ...procurementSaasHandlers,
  ...usersHandlers,
  ...agentsHandlers,
  ...policiesHandlers,
  ...documentsHandlers,
  ...sdkComponentsHandlers,
  ...editorDeployHandlers,
  ...linkHandlers,
];

/**
 * The handlers safe to run when the portal shares an origin with the editor.
 * Three groups are excluded because their routes overlap endpoints the editor
 * itself calls, so mocking them breaks the host app:
 *   - authHandlers: /api/v1/auth/*, /api/v1/proprietary/ui-data/login (logs the
 *     editor out; the portal uses the editor's real session instead)
 *   - policiesHandlers + pipelinesHandlers: both /api/v1/policies* (the editor's
 *     own policies feature)
 * Everything kept is portal-only. `handlers` above is still the full set.
 */
export const embeddedDataHandlers = [
  ...homeHandlers,
  ...opsHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
  ...searchHandlers,
  ...sourcesHandlers,
  ...infrastructureHandlers,
  ...docsHandlers,
  ...procurementHandlers,
  ...usersHandlers,
  ...agentsHandlers,
  ...documentsHandlers,
  ...sdkComponentsHandlers,
  ...editorDeployHandlers,
  ...linkHandlers,
];

export { resetNotificationsStore } from "@portal/mocks/handlers/notifications";
export { resetProcurementStore } from "@portal/mocks/handlers/procurement";
