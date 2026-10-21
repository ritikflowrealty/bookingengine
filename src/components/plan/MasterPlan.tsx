"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

export type PlotStatus = "available" | "on_hold" | "booked" | "sold" | "blocked";
export type PlanPlot = {
  id: string;
  number: string;
  /** Percent (0–100) of the master-plan width. */
  x: number;
  /** Percent (0–100) of the master-plan height. */
  y: number;
  status: PlotStatus;
  areaSqft?: number;
  facing?: string;
  corner?: boolean;
  tags?: string[];
  /** Outline in the same percent coordinates as x / y. */
  polygon?: [number, number][];
};

export type MasterPlanProps = {
  plots: PlanPlot[];
  imageUrl?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  projectName?: string;
  height?: number | string;
  dimUnavailable?: boolean;
  /** Plots failing the predicate are faded. Keep it referentially stable (state / useMemo). */
  filter?: (p: PlanPlot) => boolean;
};

export const STATUS_KEYS: PlotStatus[] = ["available", "on_hold", "booked", "sold", "blocked"];
export const STATUS_COLOR: Record<PlotStatus, string> = {
  available: "#2e9e5b",
  on_hold: "#e0a100",
  booked: "#3d5fd9",
  sold: "#8530bb",
  blocked: "#9aa0ad",
};
export const STATUS_LABEL: Record<PlotStatus, string> = {
  available: "Available",
  on_hold: "On hold",
  booked: "Booked",
  sold: "Sold / Registered",
  blocked: "Blocked",
};

export const formatFacing = (f?: string) => f?.replace(/\s*-\s*/g, "-") ?? "";
export const formatSqft = (n: number) => Math.round(n).toLocaleString("en-IN");
export const plotAriaLabel = (p: PlanPlot) =>
  [
    `Plot ${p.number}`,
    STATUS_LABEL[p.status].toLowerCase(),
    p.areaSqft ? `${formatSqft(p.areaSqft)} sq ft` : "",
    p.facing ? `${formatFacing(p.facing)} facing` : "",
  ]
    .filter(Boolean)
    .join(", ");

const W = 1000; // world width; world height = W * aspect
const DEFAULT_ASPECT = 1.3; // portrait: plot rows are tighter in y than pairs are in x
const MAGENTA = "#C2276F";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Laid = PlanPlot & { cx: number; cy: number; w: number; h: number; fs: number; poly?: string };
type View = { s: number; tx: number; ty: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** Places every plot in world units and sizes it so it never overlaps its neighbours. */
function layoutPlots(plots: PlanPlot[], H: number): Laid[] {
  const laid: Laid[] = plots.map((p) => {
    const cx = p.x * 10;
    const cy = (p.y / 100) * H;
    if (!p.polygon?.length) return { ...p, cx, cy, w: 0, h: 0, fs: 0 };
    const pts = p.polygon.map(([x, y]) => [x * 10, (y / 100) * H]);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return { ...p, cx, cy, w, h, fs: 0, poly: pts.map((q) => q.join(",")).join(" ") };
  });
  // Width: base size nudged by area, capped by side-by-side neighbours on the same row.
  for (const a of laid) {
    if (a.poly) continue;
    let w = 22 * clamp(Math.sqrt((a.areaSqft ?? 1450) / 1450), 0.9, 1.1);
    for (const b of laid) if (b !== a && Math.abs(b.cy - a.cy) < 8) w = Math.min(w, Math.abs(b.cx - a.cx) * 0.88);
    a.w = Math.max(w, 8);
  }
  // Height: capped by stacked neighbours whose widths overlap.
  for (const a of laid) {
    if (a.poly) continue;
    let h = 15;
    for (const b of laid) if (b !== a && Math.abs(b.cx - a.cx) < (a.w + b.w) / 2) h = Math.min(h, Math.abs(b.cy - a.cy) * 0.86);
    a.h = Math.max(h, 6);
  }
  for (const a of laid) a.fs = Math.min(a.h * 0.6, (a.w * 0.85) / (0.62 * Math.max(a.number.length, 2)));
  return laid;
}

const rectPath = (laid: Laid[]) => laid.map((p) => `M${p.cx - p.w / 2} ${p.cy - p.h / 2}h${p.w}v${p.h}h${-p.w}z`).join("");
const nearest = (x: number, y: number, laid: Laid[]) => Math.min(...laid.map((p) => Math.hypot(p.cx - x, p.cy - y)));
/** The most open spot ~D units away from a plot: where its park / clubhouse most likely is. */
const openSide = (p: Laid, laid: Laid[], D = 48) =>
  [[D, 0], [-D, 0], [0, D], [0, -D]]
    .map(([dx, dy]) => ({ x: p.cx + dx, y: p.cy + dy, r: nearest(p.cx + dx, p.cy + dy, laid) }))
    .sort((a, b) => b.r - a.r)[0];
const hasTag = (p: PlanPlot, t: string) => p.tags?.some((x) => x.toLowerCase() === t);

/** Generated brochure-style site: landscape, river, parks, roads, blocks, clubhouse. */
const Scenery = memo(function Scenery({ laid, H }: { laid: Laid[]; H: number }) {
  const art = useMemo(() => {
    const d = rectPath(laid);
    const n = laid.length || 1;
    const c = { x: laid.reduce((s, p) => s + p.cx, 0) / n, y: laid.reduce((s, p) => s + p.cy, 0) / n };

    const parks = laid.filter((p) => hasTag(p, "park")).map((p) => openSide(p, laid)).filter((o) => o.r > 30);

    const club = laid.filter((p) => hasTag(p, "clubhouse")).map((p) => openSide(p, laid));
    const clubAt = club.length ? { x: club.reduce((s, o) => s + o.x, 0) / club.length, y: club.reduce((s, o) => s + o.y, 0) / club.length } : null;

    // River runs beside the riverside plots (or the far bottom-right corner), across the direction away from the centre.
    const rs = laid.filter((p) => hasTag(p, "riverside"));
    const anchor = rs.length
      ? { x: rs.reduce((s, p) => s + p.cx, 0) / rs.length, y: rs.reduce((s, p) => s + p.cy, 0) / rs.length }
      : { x: Math.max(...laid.map((p) => p.cx)), y: Math.max(...laid.map((p) => p.cy)) };
    const len = Math.hypot(anchor.x - c.x, anchor.y - c.y) || 1;
    const u = { x: (anchor.x - c.x) / len, y: (anchor.y - c.y) / len };
    const t = { x: -u.y, y: u.x };
    const C = { x: anchor.x + u.x * 72, y: anchor.y + u.y * 72 };
    const at = (k: number, m: number) => `${C.x + t.x * k + u.x * m} ${C.y + t.y * k + u.y * m}`;
    const river = `M${at(-900, 60)} C${at(-350, -10)} ${at(-150, 40)} ${at(0, 0)} S${at(450, 70)} ${at(900, 10)}`;

    // Deterministic tree scatter on open land.
    const trees: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 260; i++) {
      const x = ((i * 397) % 1000) + ((i * 53) % 37);
      const y = (((i * 613) % 997) / 997) * H;
      const r = 5 + ((i * 7) % 5);
      const dr = nearest(x, y, laid);
      const dRiver = Math.abs((x - C.x) * u.x + (y - C.y) * u.y);
      if (dr > 34 && dRiver > 40) trees.push({ x, y, r });
    }
    return { d, parks, clubAt, river, trees };
  }, [laid, H]);

  return (
    <g aria-hidden pointerEvents="none">
      <rect x={-3000} y={-3000} width={W + 6000} height={H + 6000} fill="#E7EBDA" />
      <path d={art.river} fill="none" stroke="#D3E3CC" strokeWidth={110} strokeLinecap="round" />
      <path d={art.river} fill="none" stroke="#B7D5E3" strokeWidth={62} strokeLinecap="round" />
      <path d={art.river} fill="none" stroke="#A5CADD" strokeWidth={34} strokeLinecap="round" />
      {art.trees.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="#C3D6AE" />
      ))}
      {art.parks.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={clamp(p.r - 6, 22, 46)} fill="#CFE2B9" />
      ))}
      {/* Roads are a rounded halo around the plots; blocks sit on top of them. */}
      <path d={art.d} fill="#DCD7CA" stroke="#DCD7CA" strokeWidth={38} strokeLinejoin="round" />
      <path d={art.d} fill="#EFECE4" stroke="#EFECE4" strokeWidth={35} strokeLinejoin="round" />
      <path d={art.d} fill="#FBF9F4" stroke="#FBF9F4" strokeWidth={7} strokeLinejoin="round" />
      {art.clubAt && (
        <g transform={`translate(${art.clubAt.x} ${art.clubAt.y})`}>
          <rect x={-26} y={-20} width={52} height={40} rx={7} fill="#F4EADB" stroke="#D2BF9F" strokeWidth={1.5} />
          <rect x={-17} y={-11} width={22} height={13} rx={3} fill="#A9D2E4" />
          <path d="M9 -11 l7 6 l-7 6 z" fill="#C2276F" opacity={0.75} />
          <text y={14} textAnchor="middle" fontSize={6.5} fontWeight={600} letterSpacing={0.6} fill="#8A7457">
            CLUBHOUSE
          </text>
        </g>
      )}
    </g>
  );
});

const PlotLayer = memo(function PlotLayer({
  laid,
  showLabels,
  filter,
  dimUnavailable,
}: {
  laid: Laid[];
  showLabels: boolean;
  filter?: (p: PlanPlot) => boolean;
  dimUnavailable?: boolean;
}) {
  return (
    <g>
      {laid.map((p) => {
        const faded = (filter && !filter(p)) || (dimUnavailable && p.status !== "available");
        const body = {
          className: "mp-body",
          fill: STATUS_COLOR[p.status],
          stroke: "#fff",
          strokeWidth: 1,
          vectorEffect: "non-scaling-stroke" as const,
        };
        return (
          <g
            key={p.id}
            data-id={p.id}
            className="mp-plot"
            role="button"
            tabIndex={p.status === "available" ? 0 : undefined}
            aria-label={plotAriaLabel(p)}
            opacity={faded ? 0.16 : 1}
          >
            {p.poly ? (
              <polygon points={p.poly} {...body} />
            ) : (
              <rect x={p.cx - p.w / 2} y={p.cy - p.h / 2} width={p.w} height={p.h} rx={Math.min(p.w, p.h) * 0.2} {...body} />
            )}
            {showLabels && (
              <text x={p.cx} y={p.cy} fontSize={p.fs} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={600} pointerEvents="none">
                {p.number}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});

const css = `
.mp-plot{cursor:pointer;outline:none}
.mp-plot .mp-body{transition:filter .15s}
.mp-plot:hover .mp-body{filter:brightness(1.15) saturate(1.1)}
.mp-plot:focus-visible .mp-body{stroke:#1C2033;stroke-width:3px}
.mp-plot text{font-family:var(--font-work-sans),system-ui,sans-serif}
@keyframes mp-pulse{0%{opacity:.75;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}
.mp-pulse{transform-box:fill-box;transform-origin:center;animation:mp-pulse 1.8s ease-out infinite}
@media (prefers-reduced-motion:reduce){.mp-pulse{animation:none;opacity:0}}
`;

export function MasterPlan({ plots, imageUrl, selectedId, onSelect, projectName, height = "70vh", dimUnavailable, filter }: MasterPlanProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View | null>(null); // null = fitted to the plots
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [imgAspect, setImgAspect] = useState<{ url: string; aspect: number } | null>(null);

  // Plots are placed in the image's own proportions so they line up with it.
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => img.naturalWidth && setImgAspect({ url: imageUrl, aspect: img.naturalHeight / img.naturalWidth });
    img.src = imageUrl;
  }, [imageUrl]);
  const aspect = imageUrl && imgAspect?.url === imageUrl ? imgAspect.aspect : DEFAULT_ASPECT;
  const H = W * aspect;

  const laid = useMemo(() => layoutPlots(plots, H), [plots, H]);
  const byId = useMemo(() => new Map(laid.map((p) => [p.id, p])), [laid]);
  const box = useMemo<Box>(() => {
    if (!laid.length) return { x0: 0, y0: 0, x1: W, y1: H };
    const pad = 26;
    return {
      x0: Math.min(...laid.map((p) => p.cx - p.w / 2)) - pad,
      y0: Math.min(...laid.map((p) => p.cy - p.h / 2)) - pad,
      x1: Math.max(...laid.map((p) => p.cx + p.w / 2)) + pad,
      y1: Math.max(...laid.map((p) => p.cy + p.h / 2)) + pad,
    };
  }, [laid, H]);
  const medianFs = useMemo(() => [...laid.map((p) => p.fs)].sort((a, b) => a - b)[laid.length >> 1] ?? 7, [laid]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
      setView(null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit: View = useMemo(() => {
    if (!size) return { s: 1, tx: 0, ty: 0 };
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    const s = Math.min(size.w / bw, size.h / bh);
    return { s, tx: (size.w - bw * s) / 2 - box.x0 * s, ty: (size.h - bh * s) / 2 - box.y0 * s };
  }, [size, box]);
  const v = view ?? fit;

  // Zoom between 0.7x and 12x of the fitted view; keep at least 80px of the site on screen.
  const settle = (n: View): View => {
    if (!size) return n;
    const m = 80;
    return {
      s: n.s,
      tx: clamp(n.tx, m - box.x1 * n.s, size.w - m - box.x0 * n.s),
      ty: clamp(n.ty, m - box.y1 * n.s, size.h - m - box.y0 * n.s),
    };
  };
  const zoomAt = (cur: View, px: number, py: number, f: number): View => {
    const s = clamp(cur.s * f, fit.s * 0.7, fit.s * 12);
    const k = s / cur.s;
    return settle({ s, tx: px - (px - cur.tx) * k, ty: py - (py - cur.ty) * k });
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Wheel / trackpad: native listener so we can preventDefault page scroll.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018));
      setAnimate(false);
      setHover(null);
      setView((cur) => zoomRef.current(cur ?? fitRef.current, e.clientX - r.left, e.clientY - r.top, f));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pointer gestures: one pointer pans (or taps to select), two pointers pinch-zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; plot: string | null; x: number; y: number }>({ moved: false, plot: null, x: 0, y: 0 });
  const local = (e: RPointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const plotIdAt = (t: EventTarget) => (t as Element).closest?.("[data-id]")?.getAttribute("data-id") ?? null;

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { moved: false, plot: plotIdAt(e.target), ...p };
    else gesture.current.moved = true; // a second finger turns any tap into a pinch
    setAnimate(false);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") {
        const id = plotIdAt(e.target);
        setHover(id ? { id, ...p } : null);
      }
      return;
    }
    const g = gesture.current;
    if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) > 6) {
        g.moved = true;
        setHover(null);
      }
      if (g.moved) setView((cur) => settle({ ...(cur ?? fit), tx: (cur ?? fit).tx + p.x - prev.x, ty: (cur ?? fit).ty + p.y - prev.y }));
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const d1 = Math.hypot(p.x - other.x, p.y - other.y);
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const m1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      setView((cur) => {
        const c = cur ?? fit;
        return zoomAt({ ...c, tx: c.tx + m1.x - m0.x, ty: c.ty + m1.y - m0.y }, m1.x, m1.y, d1 / d0);
      });
    }
    pointers.current.set(e.pointerId, p);
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    if (e.type === "pointerup" && pointers.current.size === 1 && !g.moved && g.plot) onSelect?.(g.plot);
    pointers.current.delete(e.pointerId);
  };

  const zoomBy = (f: number) => {
    if (!size) return;
    setAnimate(true);
    setView((cur) => zoomAt(cur ?? fit, size.w / 2, size.h / 2, f));
  };

  const showLabels = v.s * medianFs >= 8.5;
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const hovered = hover ? byId.get(hover.id) : undefined;

  let tip: CSSProperties | undefined;
  if (hovered && hover && size) {
    const tw = 232;
    const th = 150;
    const left = hover.x + 18 + tw > size.w ? hover.x - 18 - tw : hover.x + 18;
    const top = hover.y + 18 + th > size.h ? hover.y - 18 - th : hover.y + 18;
    tip = { left: clamp(left, 8, size.w - tw - 8), top: clamp(top, 8, size.h - th - 8), width: tw };
  }

  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden rounded-2xl border border-line bg-[#E7EBDA] select-none"
      style={{ height, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      {size && (
        <svg
          width={size.w}
          height={size.h}
          className="absolute inset-0 block"
          role="group"
          aria-label={`${projectName ?? "Project"} master plan, ${plots.length} plots`}
          onKeyDown={(e) => {
            const id = plotIdAt(e.target);
            if (id && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onSelect?.(id);
            }
          }}
          onFocus={(e) => {
            const p = byId.get(plotIdAt(e.target) ?? "");
            const el = boxRef.current;
            if (!p || !el || !size) return;
            // Focusing an off-screen plot scrolls the clipped container; undo that and pan to it instead.
            el.scrollTop = el.scrollLeft = 0;
            let { tx, ty } = v;
            const x = p.cx * v.s + tx;
            const y = p.cy * v.s + ty;
            if (x < 40 || x > size.w - 40 || y < 40 || y > size.h - 40) {
              tx += size.w / 2 - x;
              ty += size.h / 2 - y;
              setAnimate(true);
              setView({ s: v.s, tx, ty });
            }
            if ((e.target as Element).matches(":focus-visible")) setHover({ id: p.id, x: p.cx * v.s + tx, y: p.cy * v.s + ty });
          }}
          onBlur={() => setHover(null)}
        >
          <style>{css}</style>
          <g
            style={{
              transform: `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`,
              transition: animate ? "transform 300ms cubic-bezier(.2,.7,.2,1)" : undefined,
            }}
          >
            {imageUrl ? (
              <>
                <rect x={-3000} y={-3000} width={W + 6000} height={H + 6000} fill="#F7F5F0" />
                <image href={imageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
              </>
            ) : (
              <Scenery laid={laid} H={H} />
            )}
            <PlotLayer laid={laid} showLabels={showLabels} filter={filter} dimUnavailable={dimUnavailable} />
            {selected && (
              <g pointerEvents="none">
                <rect
                  className="mp-pulse"
                  x={selected.cx - selected.w / 2 - 2}
                  y={selected.cy - selected.h / 2 - 2}
                  width={selected.w + 4}
                  height={selected.h + 4}
                  rx={4}
                  fill="none"
                  stroke={MAGENTA}
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={selected.cx - selected.w / 2 - 2}
                  y={selected.cy - selected.h / 2 - 2}
                  width={selected.w + 4}
                  height={selected.h + 4}
                  rx={4}
                  fill="none"
                  stroke={MAGENTA}
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>
        </svg>
      )}

      {/* Compass */}
      <div className="pointer-events-none absolute left-3 top-3 flex h-12 w-12 flex-col items-center justify-center rounded-full bg-white/85 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path d="M12 2 L16 14 L12 12 L8 14 Z" fill="#1C2033" />
          <path d="M12 22 L8 14 L12 12 L16 14 Z" fill="#9aa0ad" />
        </svg>
        <span className="-mt-0.5 font-heading text-[10px] font-semibold leading-none text-ink">N</span>
      </div>

      {projectName && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/85 px-3 py-1.5 font-heading text-xs font-semibold tracking-[0.18em] text-ink uppercase shadow-sm ring-1 ring-black/5 backdrop-blur">
          {projectName}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-2xl bg-white/90 shadow-md ring-1 ring-black/5 backdrop-blur">
        {[
          { label: "Zoom in", icon: Plus, on: () => zoomBy(1.6) },
          { label: "Zoom out", icon: Minus, on: () => zoomBy(1 / 1.6) },
          {
            label: "Reset view",
            icon: RotateCcw,
            on: () => {
              setAnimate(true);
              setView(null);
            },
          },
        ].map(({ label, icon: Icon, on }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={on}
            className="flex h-12 w-12 items-center justify-center border-b border-line text-ink transition last:border-b-0 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-purple active:bg-line"
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </button>
        ))}
      </div>

      {hovered && tip && (
        <div className="pointer-events-none absolute z-10 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5" style={tip}>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-heading text-lg font-semibold text-ink">Plot {hovered.number}</div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[hovered.status] }} />
              {STATUS_LABEL[hovered.status]}
            </span>
          </div>
          <div className="mt-1 text-sm text-ink">
            {hovered.areaSqft ? `${formatSqft(hovered.areaSqft)} sq ft` : "—"}
            {hovered.facing ? ` · ${formatFacing(hovered.facing)} facing` : ""}
          </div>
          {(hovered.corner || !!hovered.tags?.length) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {hovered.corner && <span className="rounded-full bg-[#F38A3F]/15 px-2 py-0.5 text-xs font-medium text-[#B85E1E]">Corner</span>}
              {hovered.tags?.map((t) => (
                <span key={t} className="rounded-full bg-purple/10 px-2 py-0.5 text-xs font-medium text-purple">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2.5 text-xs text-muted">Click to view details</div>
        </div>
      )}
    </div>
  );
}
