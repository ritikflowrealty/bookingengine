import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, bigserial } from "drizzle-orm/pg-core";
import type { PriceListConfig, CostSheet } from "@/lib/pricing/engine";
import { BOOKING_STATUSES, UNIT_STATUSES } from "@/lib/booking/state";
import { ROLES } from "@/lib/auth/permissions";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
// Areas and money: numeric so Postgres never rounds; Drizzle returns them as strings.
const area = (name: string) => numeric(name, { precision: 12, scale: 2 });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const roleEnum = pgEnum("role", ROLES);
export const unitStatusEnum = pgEnum("unit_status", UNIT_STATUSES);
export const bookingStatusEnum = pgEnum("booking_status", BOOKING_STATUSES);
export const projectTypeEnum = pgEnum("project_type", ["residential", "plotted", "villa", "row_house", "commercial"]);
export const unitKindEnum = pgEnum("unit_kind", ["apartment", "plot", "villa", "row_house", "commercial"]);
export const priceListStatusEnum = pgEnum("price_list_status", ["draft", "active", "archived"]);
export const approvalTypeEnum = pgEnum("approval_type", ["discount", "hold_extension", "cancellation", "transfer"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "withdrawn"]);
export const waProviderEnum = pgEnum("wa_provider", ["doubletick", "gallabox", "none"]);

export const developers = pgTable("developers", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoKey: text("logo_key"),
  colors: jsonb("colors").$type<{ primary?: string; accent?: string }>(),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  developerId: uuid("developer_id").notNull().references(() => developers.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: projectTypeEnum("type").notNull(),
  city: text("city"),
  reraNumbers: text("rera_numbers").array().notNull().default(sql`'{}'`),
  logoKey: text("logo_key"),
  accentColor: text("accent_color"),
  status: text("status").notNull().default("active"),
  // Integrations hold env-var *names*, never secret values.
  totalitySiteUrl: text("totality_site_url"),
  totalityEnvKey: text("totality_env_key"), // e.g. TOTALITY_SIPANI → TOTALITY_SIPANI_USER / _PASSWORD
  waProvider: waProviderEnum("wa_provider").notNull().default("none"),
  waEnvKey: text("wa_env_key"), // e.g. GALLABOX_RIVERINE → GALLABOX_RIVERINE_KEY / _SECRET
  payuEnvKey: text("payu_env_key"),
  holdHours: integer("hold_hours").notNull().default(24),
  checkoutHoldMinutes: integer("checkout_hold_minutes").notNull().default(15),
  tokenAmount: money("token_amount").notNull().default("200000"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 4 }).notNull().default("0.05"),
  publicBooking: boolean("public_booking").notNull().default(false),
  discountLimits: jsonb("discount_limits").$type<Partial<Record<(typeof ROLES)[number], number>>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const phases = pgTable("phases", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(), // "Phase 1", "Window 2"
  sortOrder: integer("sort_order").notNull().default(0),
});

export const towers = pgTable("towers", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  phaseId: uuid("phase_id").references(() => phases.id),
  name: text("name").notNull(), // "DAPHNE", "C"
  code: text("code").notNull(), // used in unit numbers: "D", "C"
  floors: integer("floors").notNull(), // highest floor number
  groundLabel: text("ground_label").notNull().default("G"),
  basements: integer("basements").notNull().default(0),
  unitsPerFloor: integer("units_per_floor").notNull(),
  unitNumberFormat: text("unit_number_format").notNull().default("{tower}-{floor}{series:02}"),
  style: jsonb("style").$type<{ template?: string; color?: string }>(),
});

export const unitSeries = pgTable(
  "unit_series",
  {
    id: id(),
    towerId: uuid("tower_id").notNull().references(() => towers.id),
    series: integer("series").notNull(),
    bhk: text("bhk"),
    typeLabel: text("type_label"),
    description: text("description"),
    facing: text("facing"),
    direction: text("direction"),
    view: text("view"),
    tier: text("tier"),
    carpet: area("carpet"),
    balcony: area("balcony"),
    sitout: area("sitout"),
    sbua: area("sbua"),
    uds: area("uds"),
  },
  (t) => [uniqueIndex("unit_series_tower_series").on(t.towerId, t.series)],
);

export const masterPlans = pgTable("master_plans", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  imageKey: text("image_key").notNull(),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  scale: jsonb("scale").$type<{ metersPerPx?: number }>(),
});

// One row per sellable thing; plots are units with kind = 'plot'.
export const units = pgTable(
  "units",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    phaseId: uuid("phase_id").references(() => phases.id),
    towerId: uuid("tower_id").references(() => towers.id),
    seriesId: uuid("series_id").references(() => unitSeries.id),
    kind: unitKindEnum("kind").notNull(),
    number: text("number").notNull(), // "C-1401", "D-001", plot "27"
    floor: integer("floor"), // ground = 0, basements negative
    bhk: text("bhk"),
    typeLabel: text("type_label"),
    description: text("description"),
    carpet: area("carpet"),
    balcony: area("balcony"),
    sitout: area("sitout"),
    terrace: area("terrace"),
    sbua: area("sbua"),
    uds: area("uds"),
    usableCarpet: area("usable_carpet"),
    plotAreaSqm: area("plot_area_sqm"),
    plotAreaSqft: area("plot_area_sqft"),
    facing: text("facing"),
    direction: text("direction"),
    view: text("view"),
    tier: text("tier"),
    corner: boolean("corner").notNull().default(false),
    tags: text("tags").array().notNull().default(sql`'{}'`), // pricing condition tags: east, park, river, amenity…
    // Per-unit pricing inputs the price list references via { attr }. Internal ones (closingPsf, sourcingPsf,
    // targetPsf) are stripped for roles without inventory.view_internal.
    priceAttrs: jsonb("price_attrs").$type<Record<string, number>>().notNull().default({}),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), // plot shape, segment, avenue, parking slot, FAR…
    landownerShare: boolean("landowner_share").notNull().default(false),
    plan: jsonb("plan").$type<{ x?: number; y?: number; polygon?: [number, number][] }>(), // master-plan position (%)
    status: unitStatusEnum("status").notNull().default("available"),
    blockedReason: text("blocked_reason"),
    heldBy: uuid("held_by"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    bookingId: uuid("booking_id"),
    totalityUnitId: text("totality_unit_id"),
    version: integer("version").notNull().default(0), // optimistic lock; bump on every status change
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("units_project_number").on(t.projectId, t.number), index("units_project_status").on(t.projectId, t.status), index("units_hold_expiry").on(t.holdExpiresAt)],
);

export const priceLists = pgTable(
  "price_lists",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    phaseId: uuid("phase_id").references(() => phases.id),
    name: text("name").notNull(), // "Launch", "Oct Price Sheet", "No-EMI Monsoon"
    version: integer("version").notNull(),
    status: priceListStatusEnum("status").notNull().default("draft"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    // Rules, offers and payment plan live together so a booking can freeze exactly what it was priced with.
    config: jsonb("config").$type<PriceListConfig>().notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("price_lists_version").on(t.projectId, t.name, t.version)],
);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: roleEnum("role").notNull(),
  managerId: uuid("manager_id"),
  passwordHash: text("password_hash"),
  otpEnabled: boolean("otp_enabled").notNull().default(false),
  allProjects: boolean("all_projects").notNull().default(false),
  developerId: uuid("developer_id").references(() => developers.id),
  canBlock: boolean("can_block").notNull().default(false),
  active: boolean("active").notNull().default(true),
  kioskPinHash: text("kiosk_pin_hash"),
  createdAt: createdAt(),
});

export const userProjects = pgTable("user_projects", {
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
}, (t) => [uniqueIndex("user_projects_pk").on(t.userId, t.projectId)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id"),
  customerId: uuid("customer_id"),
  kiosk: boolean("kiosk").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const otpChallenges = pgTable("otp_challenges", {
  id: id(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("otp_phone_created").on(t.phone, t.createdAt)]);

export const leads = pgTable("leads", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  totalityId: text("totality_id"),
  name: text("name"),
  phone: text("phone").notNull(),
  email: text("email"),
  source: text("source"),
  subSource: text("sub_source"),
  preSales: text("pre_sales"),
  salesManagerId: uuid("sales_manager_id").references(() => users.id),
  salesManagerName: text("sales_manager_name"),
  status: text("status"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
}, (t) => [index("leads_phone").on(t.phone), uniqueIndex("leads_totality").on(t.projectId, t.totalityId)]);

export const customers = pgTable("customers", {
  id: id(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  email: text("email"),
  kyc: jsonb("kyc").$type<Record<string, unknown>>().notNull().default({}), // booking-form fields
  createdAt: createdAt(),
});

export const bookings = pgTable("bookings", {
  id: id(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  leadId: uuid("lead_id").references(() => leads.id),
  customerId: uuid("customer_id").references(() => customers.id),
  priceListId: uuid("price_list_id").notNull().references(() => priceLists.id),
  costSheet: jsonb("cost_sheet").$type<CostSheet>().notNull(), // frozen snapshot
  discountPsf: money("discount_psf").notNull().default("0"),
  tokenAmount: money("token_amount").notNull(),
  status: bookingStatusEnum("status").notNull().default("draft"),
  formStatus: text("form_status").notNull().default("pending"),
  kycStatus: text("kyc_status").notNull().default("pending"),
  createdBy: uuid("created_by"),
  salesManagerId: uuid("sales_manager_id").references(() => users.id),
  teamLeadId: uuid("team_lead_id").references(() => users.id),
  channelPartnerId: uuid("channel_partner_id").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // Defence in depth on top of row locks: at most one live booking per unit.
  uniqueIndex("bookings_one_live_per_unit").on(t.unitId).where(sql`status not in ('cancelled', 'draft')`),
]);

export const coApplicants = pgTable("co_applicants", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  name: text("name").notNull(),
  relation: text("relation"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
});

export const payments = pgTable("payments", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  txnId: text("txn_id").notNull().unique(), // our PayU txnid
  payuId: text("payu_id"),
  amount: money("amount").notNull(),
  status: text("status").notNull().default("initiated"), // initiated | success | failure | refunded
  raw: jsonb("raw"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: id(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  type: text("type").notNull(), // aadhaar | pan | photo | address_proof | passport | oci
  storageKey: text("storage_key").notNull(), // private blob key; served only via short-lived signed URLs
  uploadedAt: createdAt(),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const approvals = pgTable("approvals", {
  id: id(),
  type: approvalTypeEnum("type").notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  unitId: uuid("unit_id").references(() => units.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  approverId: uuid("approver_id").references(() => users.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), // e.g. { discountPsf: 75 }
  comments: text("comments"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// Outbound/inbound integration work (Totality, WhatsApp) with retries.
export const syncJobs = pgTable("sync_jobs", {
  id: id(),
  kind: text("kind").notNull(), // totality.push_booking | totality.pull_leads | wa.send …
  projectId: uuid("project_id").references(() => projects.id),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [index("sync_jobs_due").on(t.status, t.runAfter)]);

export const syncLog = pgTable("sync_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobId: uuid("job_id").references(() => syncJobs.id),
  direction: text("direction").notNull(), // out | in
  request: jsonb("request"),
  response: jsonb("response"),
  ok: boolean("ok").notNull(),
  at: createdAt(),
});

// Shareable cost-sheet links (/s/<token>): the quote is frozen at creation, valid for `expiresAt`.
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  createdBy: uuid("created_by").references(() => users.id),
  customerName: text("customer_name"),
  costSheet: jsonb("cost_sheet").$type<CostSheet>().notNull(), // customer view only
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  actorType: text("actor_type").notNull().default("user"), // user | customer | system
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: createdAt(),
}, (t) => [index("audit_entity").on(t.entity, t.entityId)]);
