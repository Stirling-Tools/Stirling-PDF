import { type IconKey } from "@app/components/tools/automate/iconMap";

/**
 * The saved-config icon key (an {@link iconMap} key) for a built-in suggested
 * automation, chosen by its id. Suggested automations display a component icon,
 * but a saved AutomationConfig stores an icon by name.
 */
export function iconKeyForSuggestedAutomation(id: string): IconKey {
  switch (id) {
    case "secure-pdf-ingestion":
    case "secure-workflow":
      return "SecurityIcon";
    case "email-preparation":
      return "CompressIcon";
    case "process-images":
      return "StarIcon";
    default:
      return "SettingsIcon";
  }
}
