// Constants and tiny helpers shared by admin forms and server actions. Client-safe.
export const PROJECT_TYPES = ["residential", "plotted", "villa", "row_house", "commercial"] as const;
export const PROJECT_TYPE_LABEL: Record<(typeof PROJECT_TYPES)[number], string> = { residential: "Residential", plotted: "Plotted", villa: "Villa", row_house: "Row house", commercial: "Commercial" };
export const PROJECT_STATUSES = ["active", "upcoming", "paused", "sold_out", "archived"] as const;
export const WA_PROVIDERS = ["none", "doubletick", "gallabox"] as const;
export const BRAND_SWATCHES = ["#7A2DB0", "#C2276F", "#3D5FD9", "#2E9E5B", "#F38A3F"];
export const DISCOUNT_ROLES = ["sales_manager", "team_lead", "leadership"] as const;
/** JSON has no Infinity; a limit this high means "unlimited" to discountApprover(). */
export const UNLIMITED = 1e9;

export const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", leadership: "Leadership", developer_user: "Developer", team_lead: "Team lead", sales_manager: "Sales manager", pre_sales: "Pre-sales", channel_partner: "Channel partner", customer: "Customer" };

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
