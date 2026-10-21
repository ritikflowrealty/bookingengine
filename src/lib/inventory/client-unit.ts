import type { UnitView } from "./service";

/** Trimmed unit shape sent to the browser (grid, 3D, map, panel). */
export function toClientUnit(u: UnitView) {
  return {
    id: u.id,
    number: u.number,
    kind: u.kind,
    towerId: u.towerId,
    floor: u.floor,
    series: Number(u.number.match(/(\d{2})$/)?.[1] ?? 0),
    bhk: u.bhk,
    typeLabel: u.typeLabel,
    description: u.description,
    carpet: u.carpet,
    balcony: u.balcony,
    sbua: u.sbua,
    uds: u.uds,
    plotAreaSqft: u.plotAreaSqft,
    plotAreaSqm: u.plotAreaSqm,
    facing: u.facing,
    direction: u.direction,
    view: u.view,
    tier: u.tier,
    corner: u.corner,
    tags: u.tags,
    status: u.status,
    holdExpiresAt: u.holdExpiresAt ? new Date(u.holdExpiresAt).toISOString() : null,
    heldBy: u.heldBy,
    blockedReason: u.blockedReason,
    landownerShare: u.landownerShare,
    plan: u.plan,
    details: u.details,
    version: u.version,
  };
}
export type ClientUnit = ReturnType<typeof toClientUnit>;
