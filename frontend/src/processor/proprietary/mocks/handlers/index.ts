import { assistantHandlers } from "@processor/mocks/handlers/assistant";
import { authHandlers } from "@processor/mocks/handlers/auth";
import { notificationsHandlers } from "@processor/mocks/handlers/notifications";
import { searchHandlers } from "@processor/mocks/handlers/search";
import { pipelinesHandlers } from "@processor/mocks/handlers/pipelines";
import { sourcesHandlers } from "@processor/mocks/handlers/sources";
import { infrastructureHandlers } from "@processor/mocks/handlers/infrastructure";
import { procurementHandlers } from "@processor/mocks/handlers/procurement";
import { procurementSaasHandlers } from "@processor/mocks/handlers/procurementSaas";
import { docsHandlers } from "@processor/mocks/handlers/docs";
import { usersHandlers } from "@processor/mocks/handlers/users";
import { teamSaasHandlers } from "@processor/mocks/handlers/teamSaas";
import { policiesHandlers } from "@processor/mocks/handlers/policies";
import { classificationHandlers } from "@processor/mocks/handlers/classification";
import { documentsHandlers } from "@processor/mocks/handlers/documents";
import { editorDeployHandlers } from "@processor/mocks/handlers/editorDeploy";
import { linkHandlers } from "@processor/mocks/handlers/link";

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
];

export { resetNotificationsStore } from "@processor/mocks/handlers/notifications";
export { resetProcurementStore } from "@processor/mocks/handlers/procurement";
export { resetTeamSaasStore } from "@processor/mocks/handlers/teamSaas";
