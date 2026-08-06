/**
 * Curated palette of icons the classification labels use, rendered in the file
 * sidebar's label/category groups. Keys are Material Symbols names rendered via
 * {@link LocalIcon}.
 *
 * IMPORTANT — this list is also the icon BUNDLING MANIFEST for classification.
 * The label/family icons live in `classificationLabels.json`, but the bundler
 * (`scripts/generate-icons.js`) only regex-scans `.ts/.tsx` for `icon: "…"`
 * literals, not JSON — so every icon those labels use must appear here as a
 * literal or it falls back to the CDN and renders blank offline. Do NOT delete
 * `LABEL_ICON_OPTIONS` as "unused": nothing imports it, but it's load-bearing
 * for offline icons. After editing, run `task frontend:prepare:icons`.
 */

export interface LabelIconOption {
  /** Material Symbols key (no `material-symbols:` prefix). */
  icon: string;
  /** Short English name for the icon (documentation only). */
  label: string;
}

/** Fallback icon for a label with none set (and for the "Other" group). */
export const DEFAULT_LABEL_ICON = "sell";

export const LABEL_ICON_OPTIONS: LabelIconOption[] = [
  // Money / finance
  { icon: "receipt-long", label: "Receipt" },
  { icon: "request-quote", label: "Quote" },
  { icon: "payments", label: "Payments" },
  { icon: "account-balance", label: "Bank" },
  { icon: "savings", label: "Savings" },
  { icon: "credit-card", label: "Card" },
  { icon: "point-of-sale", label: "Point of sale" },
  { icon: "sell", label: "Label" },
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
  // Money / finance (extended)
  { icon: "paid", label: "Paid" },
  { icon: "attach-money", label: "Money" },
  { icon: "currency-exchange", label: "Exchange" },
  { icon: "account-balance-wallet", label: "Wallet" },
  { icon: "price-check", label: "Price check" },
  { icon: "wallet", label: "Billfold" },
  { icon: "redeem", label: "Redeem" },
  { icon: "receipt", label: "Receipt (short)" },
  { icon: "percent", label: "Percent" },
  // Legal / security (extended)
  { icon: "encrypted", label: "Encrypted" },
  { icon: "privacy-tip", label: "Privacy" },
  { icon: "security", label: "Security" },
  { icon: "assured-workload", label: "Assured" },
  { icon: "copyright", label: "Copyright" },
  { icon: "approval", label: "Approval" },
  { icon: "history-edu", label: "Quill" },
  // Documents (extended)
  { icon: "topic", label: "Topic" },
  { icon: "note-add", label: "New note" },
  { icon: "text-snippet", label: "Snippet" },
  { icon: "library-books", label: "Library" },
  { icon: "auto-stories", label: "Open book" },
  { icon: "newspaper", label: "Newspaper" },
  { icon: "folder-open", label: "Open folder" },
  { icon: "format-list-bulleted", label: "List" },
  // People / HR (extended)
  { icon: "manage-accounts", label: "Manage accounts" },
  { icon: "supervisor-account", label: "Supervisor" },
  { icon: "how-to-reg", label: "Registered" },
  { icon: "diversity-3", label: "Team" },
  { icon: "psychology", label: "Psychology" },
  { icon: "volunteer-activism", label: "Volunteer" },
  // Health (extended)
  { icon: "medical-information", label: "Medical info" },
  { icon: "medication", label: "Medication" },
  { icon: "vaccines", label: "Vaccine" },
  { icon: "monitor-heart", label: "Heart monitor" },
  { icon: "emergency", label: "Emergency" },
  { icon: "stethoscope", label: "Stethoscope" },
  // Property / places (extended)
  { icon: "home", label: "Home" },
  { icon: "apartment", label: "Apartment" },
  { icon: "storefront", label: "Storefront" },
  { icon: "location-on", label: "Location" },
  { icon: "map", label: "Map" },
  { icon: "public", label: "Globe" },
  // Logistics (extended)
  { icon: "package-2", label: "Package" },
  { icon: "warehouse", label: "Warehouse" },
  { icon: "forklift", label: "Forklift" },
  { icon: "pallet", label: "Pallet" },
  { icon: "flight", label: "Flight" },
  { icon: "luggage", label: "Luggage" },
  // Technology / engineering (extended)
  { icon: "code", label: "Code" },
  { icon: "terminal", label: "Terminal" },
  { icon: "database", label: "Database" },
  { icon: "cloud", label: "Cloud" },
  { icon: "api", label: "API" },
  { icon: "bug-report", label: "Bug" },
  { icon: "build", label: "Wrench" },
  { icon: "architecture", label: "Compass" },
  { icon: "design-services", label: "Design" },
  { icon: "precision-manufacturing", label: "Robotics" },
  { icon: "factory", label: "Factory" },
  { icon: "bolt", label: "Bolt" },
  { icon: "construction", label: "Construction" },
  // Charts / time (extended)
  { icon: "analytics", label: "Analytics" },
  { icon: "insights", label: "Insights" },
  { icon: "query-stats", label: "Stats" },
  { icon: "leaderboard", label: "Leaderboard" },
  { icon: "functions", label: "Functions" },
  { icon: "schedule", label: "Clock" },
  { icon: "pending-actions", label: "Pending" },
  { icon: "timeline", label: "Timeline" },
  // Communication (extended)
  { icon: "chat", label: "Chat" },
  { icon: "forum", label: "Forum" },
  { icon: "call", label: "Call" },
  { icon: "send", label: "Send" },
  { icon: "inbox", label: "Inbox" },
  { icon: "alternate-email", label: "At sign" },
  // Events / travel (extended)
  { icon: "airplane-ticket", label: "Plane ticket" },
  { icon: "confirmation-number", label: "Ticket stub" },
  { icon: "hotel", label: "Hotel" },
  { icon: "restaurant", label: "Restaurant" },
  { icon: "celebration", label: "Celebration" },
  // Media / creative (extended)
  { icon: "photo-camera", label: "Camera" },
  { icon: "videocam", label: "Video" },
  { icon: "music-note", label: "Music" },
  { icon: "palette", label: "Palette" },
  { icon: "brush", label: "Brush" },
  { icon: "movie", label: "Movie" },
  // Nature / misc (extended)
  { icon: "eco", label: "Eco" },
  { icon: "recycling", label: "Recycling" },
  { icon: "agriculture", label: "Agriculture" },
];
