/** Mock notifications for the header dropdown. */

export type NotificationCategory =
  | "pipeline"
  | "deploy"
  | "billing"
  | "audit"
  | "agent"
  | "doc";

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  description: string;
  /** Relative-time string. */
  time: string;
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    category: "pipeline",
    title: "COI Compliance — golden set passed",
    description: "48/48 docs reproduced expected outputs after schema change",
    time: "2m ago",
  },
  {
    id: "n2",
    category: "deploy",
    title: "Deploy succeeded — Prior Auth v2.4",
    description: "Rolled to us-east-1 + eu-west-1. P99 142ms.",
    time: "14m ago",
  },
  {
    id: "n3",
    category: "billing",
    title: "Approaching 80% of monthly cap",
    description: "389k of 500k docs processed. Auto-upgrade not enabled.",
    time: "1h ago",
  },
  {
    id: "n4",
    category: "audit",
    title: "Four-eyes elevation requested",
    description: "Compliance Lead approval pending for redacted doc #28471",
    time: "3h ago",
  },
  {
    id: "n5",
    category: "agent",
    title: "KYC Processor — eval drop",
    description: "Pass rate fell to 87% on the latest 72h window",
    time: "5h ago",
  },
  {
    id: "n6",
    category: "doc",
    title: "Schema drift detected — Invoice v3",
    description: "12 docs in last 24h didn't match expected schema",
    time: "yesterday",
  },
];
