import { assistantHandlers } from "@portal/mocks/handlers/assistant";
import { authHandlers } from "@portal/mocks/handlers/auth";
import { notificationsHandlers } from "@portal/mocks/handlers/notifications";
import { pipelinesHandlers } from "@portal/mocks/handlers/pipelines";
import { sourcesHandlers } from "@portal/mocks/handlers/sources";
import { infrastructureHandlers } from "@portal/mocks/handlers/infrastructure";
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
import { fileRunEventsHandlers } from "@portal/mocks/handlers/fileRunEvents";

export const handlers = [
  ...authHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
  ...pipelinesHandlers,
  ...sourcesHandlers,
  ...infrastructureHandlers,
  ...docsHandlers,
  ...procurementSaasHandlers,
  ...usersHandlers,
  ...teamSaasHandlers,
  ...policiesHandlers,
  ...classificationHandlers,
  ...documentsHandlers,
  ...editorDeployHandlers,
  ...linkHandlers,
  ...integrationsHandlers,
  ...fileRunEventsHandlers,
];

export { resetNotificationsStore } from "@portal/mocks/handlers/notifications";
export { resetTeamSaasStore } from "@portal/mocks/handlers/teamSaas";
