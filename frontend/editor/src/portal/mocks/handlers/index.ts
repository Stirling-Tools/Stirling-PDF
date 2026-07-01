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
import { docsHandlers } from "@portal/mocks/handlers/docs";
import { settingsHandlers } from "@portal/mocks/handlers/settings";
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
  ...settingsHandlers,
  ...usersHandlers,
  ...agentsHandlers,
  ...policiesHandlers,
  ...documentsHandlers,
  ...sdkComponentsHandlers,
  ...editorDeployHandlers,
  ...linkHandlers,
];

export { resetNotificationsStore } from "@portal/mocks/handlers/notifications";
export { resetProcurementStore } from "@portal/mocks/handlers/procurement";
