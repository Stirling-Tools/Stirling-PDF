import { assistantHandlers } from "@portal/mocks/handlers/assistant";
import { authHandlers } from "@portal/mocks/handlers/auth";
import { notificationsHandlers } from "@portal/mocks/handlers/notifications";
import { searchHandlers } from "@portal/mocks/handlers/search";
import { pipelinesHandlers } from "@portal/mocks/handlers/pipelines";
import { sourcesHandlers } from "@portal/mocks/handlers/sources";
import { infrastructureHandlers } from "@portal/mocks/handlers/infrastructure";
import { procurementHandlers } from "@portal/mocks/handlers/procurement";
import { procurementSaasHandlers } from "@portal/mocks/handlers/procurementSaas";
import { docsHandlers } from "@portal/mocks/handlers/docs";
import { usersHandlers } from "@portal/mocks/handlers/users";
import { teamSaasHandlers } from "@portal/mocks/handlers/teamSaas";
import { policiesHandlers } from "@portal/mocks/handlers/policies";
import { classificationHandlers } from "@portal/mocks/handlers/classification";
import { documentsHandlers } from "@portal/mocks/handlers/documents";
import { editorDeployHandlers } from "@portal/mocks/handlers/editorDeploy";
import { linkHandlers } from "@portal/mocks/handlers/link";
import { integrationsHandlers } from "@portal/mocks/handlers/integrations";

export const handlers = [
  ...authHandlers,
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
  ...teamSaasHandlers,
  ...policiesHandlers,
  ...classificationHandlers,
  ...documentsHandlers,
  ...editorDeployHandlers,
  ...linkHandlers,
  ...integrationsHandlers,
];

export { resetNotificationsStore } from "@portal/mocks/handlers/notifications";
export { resetProcurementStore } from "@portal/mocks/handlers/procurement";
export { resetTeamSaasStore } from "@portal/mocks/handlers/teamSaas";
