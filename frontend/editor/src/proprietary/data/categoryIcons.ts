/**
 * Curated palette of icons a taxonomy category can use, shown in the category
 * icon picker and rendered in the file sidebar. Keys are Material Symbols names
 * rendered via {@link LocalIcon}.
 *
 * IMPORTANT: each entry is written as an `icon: "…"` literal so the icon-bundler
 * (`scripts/generate-icons.js`, which regex-scans for `icon: "name"`) picks every
 * one up and bundles it — otherwise a picked icon would fall back to the CDN and
 * render blank offline. After adding/removing entries run `task frontend:prepare:icons`.
 *
 * Search is intentionally omitted for now (no synonyms/translations to maintain);
 * the palette is small enough to eyeball.
 */

export interface CategoryIconOption {
  /** Material Symbols key (no `material-symbols:` prefix). */
  icon: string;
  /** Short English label — tooltip/aria only, not user-facing copy. */
  label: string;
}

/** Fallback icon for a category with none set (and for the "Other" group). */
export const DEFAULT_CATEGORY_ICON = "folder";

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  // Money / finance
  { icon: "receipt-long", label: "Receipt" },
  { icon: "request-quote", label: "Quote" },
  { icon: "payments", label: "Payments" },
  { icon: "account-balance", label: "Bank" },
  { icon: "savings", label: "Savings" },
  { icon: "credit-card", label: "Card" },
  { icon: "point-of-sale", label: "Point of sale" },
  { icon: "sell", label: "Sell" },
  { icon: "shopping-cart", label: "Cart" },
  { icon: "calculate", label: "Calculate" },
  // Legal / compliance
  { icon: "handshake", label: "Agreement" },
  { icon: "gavel", label: "Legal" },
  { icon: "balance", label: "Balance" },
  { icon: "policy", label: "Policy" },
  { icon: "verified", label: "Verified" },
  { icon: "shield", label: "Shield" },
  { icon: "health-and-safety", label: "Safety" },
  { icon: "lock", label: "Lock" },
  { icon: "fact-check", label: "Fact check" },
  { icon: "rule", label: "Rule" },
  // Documents / writing
  { icon: "description", label: "Document" },
  { icon: "article", label: "Article" },
  { icon: "assignment", label: "Form" },
  { icon: "checklist", label: "Checklist" },
  { icon: "task", label: "Task" },
  { icon: "summarize", label: "Summary" },
  { icon: "sticky-note-2", label: "Note" },
  { icon: "edit-document", label: "Edit" },
  { icon: "draft", label: "Draft" },
  { icon: "folder", label: "Folder" },
  // People / comms
  { icon: "mail", label: "Mail" },
  { icon: "campaign", label: "Campaign" },
  { icon: "contact-page", label: "Contact" },
  { icon: "badge", label: "Badge" },
  { icon: "groups", label: "Group" },
  { icon: "person", label: "Person" },
  { icon: "work", label: "Work" },
  { icon: "business-center", label: "Business" },
  { icon: "event", label: "Event" },
  { icon: "calendar-month", label: "Calendar" },
  // Charts / education / logistics / misc
  { icon: "bar-chart", label: "Bar chart" },
  { icon: "monitoring", label: "Monitoring" },
  { icon: "pie-chart", label: "Pie chart" },
  { icon: "trending-up", label: "Trend" },
  { icon: "table-chart", label: "Table" },
  { icon: "school", label: "School" },
  { icon: "menu-book", label: "Book" },
  { icon: "science", label: "Science" },
  { icon: "medical-services", label: "Medical" },
  { icon: "local-shipping", label: "Shipping" },
  { icon: "slideshow", label: "Presentation" },
  { icon: "home-work", label: "Property" },
  { icon: "real-estate-agent", label: "Real estate" },
  { icon: "engineering", label: "Technical" },
  { icon: "inventory-2", label: "Inventory" },
  { icon: "image", label: "Image" },
];

/** Set of valid palette keys, for validating a stored/imported icon. */
export const CATEGORY_ICON_KEYS: ReadonlySet<string> = new Set(
  CATEGORY_ICON_OPTIONS.map((option) => option.icon),
);
