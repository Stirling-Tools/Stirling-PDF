import { assistantHandlers } from "@portal/mocks/handlers/assistant";
import { endpointsHandlers } from "@portal/mocks/handlers/endpoints";
import { homeHandlers } from "@portal/mocks/handlers/home";
import { notificationsHandlers } from "@portal/mocks/handlers/notifications";
import { opsHandlers } from "@portal/mocks/handlers/ops";
import { searchHandlers } from "@portal/mocks/handlers/search";

export const handlers = [
  ...homeHandlers,
  ...opsHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
  ...searchHandlers,
  ...endpointsHandlers,
];

export { resetNotificationsStore } from "@portal/mocks/handlers/notifications";
