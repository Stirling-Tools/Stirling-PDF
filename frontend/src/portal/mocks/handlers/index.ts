import { assistantHandlers } from "@app/mocks/handlers/assistant";
import { endpointsHandlers } from "@app/mocks/handlers/endpoints";
import { homeHandlers } from "@app/mocks/handlers/home";
import { notificationsHandlers } from "@app/mocks/handlers/notifications";
import { opsHandlers } from "@app/mocks/handlers/ops";
import { searchHandlers } from "@app/mocks/handlers/search";

export const handlers = [
  ...homeHandlers,
  ...opsHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
  ...searchHandlers,
  ...endpointsHandlers,
];

export { resetNotificationsStore } from "@app/mocks/handlers/notifications";
