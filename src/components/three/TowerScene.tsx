"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Edges, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { STATUS_LABELS, type UnitStatus } from "@/components/StatusLegend";

export type TowerSceneUnit = { id: string; towerId: string; floor: number; series: number; number: string; status: UnitStatus; label?: string };
/** `floors` counts every level including ground: floor indices run 0 (G) .. floors - 1. */
export type TowerSceneTower = { id: string; name: string; code: string; floors: number; unitsPerFloor: number };
export type TowerSceneProps = {
  projectName: string;
  accent?: string;
  towers: TowerSceneTower[];
  units: TowerSceneUnit[];
  selectedId?: string | null;
  onSelect?: (unitId: string) => void;
  focusTowerId?: string | null;
  height?: number | string;
};

// Same values as the --st-* CSS vars; WebGL cannot read CSS vars.
export const STATUS_HEX: Record<UnitStatus, string> = {
  available: "#2e9e5b",
  on_hold: "#e0a100",
  booked: "#3d5fd9",
  sold: "#8530bb",
  blocked: "#9aa0ad",
};
const STATUSES = Object.keys(STATUS_HEX) as UnitStatus[];
const GROUND = "#F7F5F0";

// Massing dimensions in scene units (~3.3 m each).
const FLOOR_H = 0.9;
const SLAB_T = 0.07;
const UNIT_W = 3;
const UNIT_D = 2.6;
const CORE = 1.1;
const GAP = 0.08;
const TOWER_GAP = 4.5;
const PODIUM_H = 0.5;
const PODIUM_PAD = 1.2;
const LABEL_LIFT = 1.5; // tower labels sit above this point (bottom-anchored)

type TowerLayout = TowerSceneTower & { x: number; width: number; depth: number; front: number; back: number; top: number };
type Block = { unit: TowerSceneUnit; pos: THREE.Vector3; size: THREE.Vector3; nz: number };
type Anchor = { key: string; pos: THREE.Vector3; node: ReactNode };

function layoutTowers(towers: TowerSceneTower[]): TowerLayout[] {
  const sorted = [...towers].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let cursor = 0;
  const out = sorted.map((t) => {
    const n = Math.max(1, t.unitsPerFloor);
    const front = Math.ceil(n / 2);
    const back = n - front;
    const width = front * UNIT_W;
    const depth = (back ? 2 : 1) * UNIT_D + CORE;
    const x = cursor + width / 2;
    cursor += width + TOWER_GAP;
    return { ...t, x, width, depth, front, back, top: PODIUM_H + t.floors * FLOOR_H };
  });
  const shift = (cursor - TOWER_GAP) / 2; // centre the row on the origin
  return out.map((t) => ({ ...t, x: t.x - shift }));
}

/** Units go round the plate: series 1..front along the front face (left→right), the rest back along the rear face. */
function blockFor(t: TowerLayout, u: TowerSceneUnit): Block {
  const idx = (Math.max(1, u.series) - 1) % (t.front + t.back);
  const onFront = idx < t.front;
  const cw = t.width / (onFront ? t.front : t.back);
  const col = onFront ? idx : idx - t.front;
  const x = onFront ? -t.width / 2 + cw * (col + 0.5) : t.width / 2 - cw * (col + 0.5);
  const z = (onFront ? 1 : -1) * (t.depth / 2 - UNIT_D / 2);
  const y = PODIUM_H + u.floor * FLOOR_H + SLAB_T + (FLOOR_H - SLAB_T) / 2;
  return { unit: u, pos: new THREE.Vector3(t.x + x, y, z), size: new THREE.Vector3(cw - GAP, FLOOR_H - SLAB_T, UNIT_D - GAP), nz: onFront ? 1 : -1 };
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

/** Glazing pattern (mullions + sheen), multiplied over each unit's status colour. */
function facadeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#d6d6d6");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "rgba(0,0,0,.22)";
  for (const x of [85, 170]) g.fillRect(x - 1, 0, 3, 64);
  g.fillRect(0, 44, 256, 2); // sill / spandrel line
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function InstancedBoxes({ boxes, children, ...rest }: { boxes: { pos: THREE.Vector3; size: THREE.Vector3 }[]; children: ReactNode } & Partial<{
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}>) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    boxes.forEach((b, i) => mesh.setMatrixAt(i, m.compose(b.pos, q, b.size)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  if (!boxes.length) return null;
  return (
    <instancedMesh key={boxes.length} ref={ref} args={[BOX, undefined, boxes.length]} {...rest}>
      {children}
    </instancedMesh>
  );
}

function towersBox(towers: TowerLayout[]) {
  const box = new THREE.Box3();
  for (const t of towers) {
    box.expandByPoint(new THREE.Vector3(t.x - t.width / 2, 0, -t.depth / 2));
    box.expandByPoint(new THREE.Vector3(t.x + t.width / 2, t.top + LABEL_LIFT + 3, t.depth / 2));
  }
  return box;
}

function fitView(box: THREE.Box3, fov: number, aspect: number) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const dist = Math.max((size.y * 1.2) / (2 * tan), ((size.x + size.z * 0.5) * 1.12) / (2 * tan * aspect)) + size.z / 2;
  const target = new THREE.Vector3(center.x, size.y * 0.46, center.z);
  const dir = new THREE.Vector3(0.5, 0.3, 1).normalize();
  return { target, pos: target.clone().addScaledVector(dir, dist), dist };
}

function CameraRig({ layout, focusTowerId, onFit }: { layout: TowerLayout[]; focusTowerId?: string | null; onFit: (d: number) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as ComponentRef<typeof OrbitControls> | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3; snap: boolean } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!layout.length) return;
    const focus = layout.find((t) => t.id === focusTowerId);
    onFit(Math.max(30, fitView(towersBox(layout), camera.fov, aspect).dist * 2));
    const { target, pos } = fitView(towersBox(focus ? [focus] : layout), camera.fov, aspect);
    goal.current = { target, pos, snap: first.current };
    first.current = false;
    invalidate();
  }, [layout, focusTowerId, aspect, camera, invalidate, onFit]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => (goal.current = null); // user grabbed the camera
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = g.snap ? 1 : 1 - Math.exp(-dt * 4);
    controls.target.lerp(g.target, k);
    camera.position.lerp(g.pos, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.01 && controls.target.distanceTo(g.target) < 0.01) goal.current = null;
    else invalidate();
  });
  return null;
}

/** Projects DOM labels onto their 3D anchors each rendered frame (one React tree, no per-label roots). */
function LabelProjector({ anchors, els }: { anchors: Anchor[]; els: RefObject<Map<string, HTMLDivElement>> }) {
  const invalidate = useThree((s) => s.invalidate);
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [anchors, invalidate]);
  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const el = els.current.get(a.key);
      if (!el) continue;
      v.copy(a.pos).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, ${a.key.startsWith("floor-") ? -50 : -100}%)`;
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
    }
  });
  return null;
}

function Selected({ block, accent }: { block: Block; accent: string }) {
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  // Continuous frames only while something is selected; the scene is a handful of draw calls.
  useFrame(({ clock }) => {
    if (halo.current) halo.current.opacity = 0.32 + 0.2 * Math.sin(clock.elapsedTime * 3.5);
    invalidate();
  });
  const pos = block.pos.clone().add(new THREE.Vector3(0, 0, block.nz * 0.25));
  const { x, y, z } = block.size;
  return (
    <group position={pos}>
      <mesh scale={[x + 0.08, y + 0.04, z]} geometry={BOX} raycast={() => null}>
        <meshStandardMaterial color={STATUS_HEX[block.unit.status]} emissive={STATUS_HEX[block.unit.status]} emissiveIntensity={0.45} roughness={0.3} />
        <Edges color="#ffffff" />
      </mesh>
      <mesh scale={[x + 0.5, y + 0.4, z + 0.5]} geometry={BOX} raycast={() => null}>
        <meshBasicMaterial ref={halo} color={accent} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function Scene({
  layout,
  blocks,
  accent,
  selectedId,
  onSelect,
  hovered,
  setHovered,
  focusTowerId,
  setMaxDist,
  maxDist,
  anchors,
  els,
}: Pick<TowerSceneProps, "selectedId" | "onSelect" | "focusTowerId"> & {
  layout: TowerLayout[];
  blocks: Block[];
  accent: string;
  hovered: Block | null;
  setHovered: (b: Block | null) => void;
  maxDist: number;
  setMaxDist: (d: number) => void;
  anchors: Anchor[];
  els: RefObject<Map<string, HTMLDivElement>>;
}) {
  const byStatus = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, blocks.filter((b) => b.unit.status === s)])) as Record<UnitStatus, Block[]>, [blocks]);
  const slabs = useMemo(
    () =>
      layout.flatMap((t) =>
        Array.from({ length: t.floors + 1 }, (_, f) => ({
          pos: new THREE.Vector3(t.x, PODIUM_H + f * FLOOR_H + SLAB_T / 2, 0),
          size: new THREE.Vector3(t.width + 0.16, SLAB_T, t.depth + 0.16),
        })),
      ),
    [layout],
  );
  const facade = useMemo(facadeTexture, []);
  const selected = blocks.find((b) => b.unit.id === selectedId);

  return (
    <>
      <color attach="background" args={[GROUND]} />
      <hemisphereLight args={["#ffffff", "#e6dfd0", 0.9]} />
      <directionalLight position={[16, 30, 24]} intensity={1.9} />
      <directionalLight position={[-22, 10, -8]} intensity={0.3} />
      {/* Local light-formers only: no HDR download, works offline. */}
      <Environment resolution={128} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 8]} scale={[16, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[-8, 3, -4]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[6, 8, -6]} scale={3} />
      </Environment>

      <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      <ContactShadows frames={1} position-y={0.002} scale={140} resolution={1024} blur={2} far={24} opacity={0.5} color="#3a3324" />

      {layout.map((t) => (
        <group key={t.id}>
          <mesh position={[t.x, PODIUM_H / 2, 0]} scale={[t.width + PODIUM_PAD * 2, PODIUM_H, t.depth + PODIUM_PAD * 2]} geometry={BOX}>
            <meshStandardMaterial color="#ebe6db" roughness={0.9} />
          </mesh>
          <mesh position={[t.x, (PODIUM_H + t.top) / 2, 0]} scale={[t.width - 0.5, t.top - PODIUM_H, CORE + 0.1]} geometry={BOX}>
            <meshStandardMaterial color="#d9d5cc" roughness={0.8} />
          </mesh>
          <mesh position={[t.x, t.top + 0.45, 0]} scale={[t.width * 0.36, 0.9, t.depth * 0.42]} geometry={BOX}>
            <meshStandardMaterial color="#efece6" roughness={0.8} />
          </mesh>
        </group>
      ))}

      <InstancedBoxes boxes={slabs}>
        <meshStandardMaterial color="#fbfaf7" roughness={0.7} />
      </InstancedBoxes>

      {STATUSES.map((s) => (
        <InstancedBoxes
          key={s}
          boxes={byStatus[s]}
          onPointerMove={(e) => {
            e.stopPropagation();
            const b = byStatus[s][e.instanceId ?? -1];
            if (b && b !== hovered) setHovered(b);
          }}
          onPointerOut={() => setHovered(null)}
          onClick={(e) => {
            e.stopPropagation();
            const b = byStatus[s][e.instanceId ?? -1];
            if (b && e.delta < 6) onSelect?.(b.unit.id); // ignore the end of an orbit drag
          }}
        >
          {/* Available units read as lit glass; the rest stay matte so the open inventory pops. */}
          <meshPhysicalMaterial
            map={facade}
            color={STATUS_HEX[s]}
            roughness={s === "available" ? 0.22 : 0.55}
            metalness={0.05}
            clearcoat={s === "available" ? 1 : 0.2}
            clearcoatRoughness={0.15}
            emissive={STATUS_HEX[s]}
            emissiveIntensity={s === "available" ? 0.28 : 0}
          />
        </InstancedBoxes>
      ))}

      {hovered && hovered.unit.id !== selectedId && (
        <mesh position={hovered.pos} scale={[hovered.size.x + 0.06, hovered.size.y + 0.04, hovered.size.z + 0.06]} geometry={BOX} raycast={() => null}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      {selected && <Selected block={selected} accent={accent} />}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={maxDist}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.06}
        screenSpacePanning={false}
      />
      <CameraRig layout={layout} focusTowerId={focusTowerId} onFit={setMaxDist} />
      <LabelProjector anchors={anchors} els={els} />
    </>
  );
}

const headingFont = { fontFamily: "var(--font-outfit), system-ui, sans-serif" };

export function TowerScene({ height = "100%", projectName, accent = "#7A2DB0", towers, units, selectedId, onSelect, focusTowerId }: TowerSceneProps) {
  const layout = useMemo(() => layoutTowers(towers), [towers]);
  const blocks = useMemo(() => {
    const byId = new Map(layout.map((t) => [t.id, t]));
    const out: Block[] = [];
    for (const u of units) {
      const t = byId.get(u.towerId);
      if (t && u.floor >= 0 && u.floor < t.floors) out.push(blockFor(t, u));
    }
    return out;
  }, [units, layout]);
  const [hovered, setHovered] = useState<Block | null>(null);
  const [maxDist, setMaxDist] = useState(120);
  const els = useRef(new Map<string, HTMLDivElement>());
  const focus = layout.find((t) => t.id === focusTowerId);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => void (document.body.style.cursor = "");
  }, [hovered]);

  const anchors = useMemo<Anchor[]>(() => {
    const out: Anchor[] = layout.map((t) => ({
      key: "tower-" + t.id,
      pos: new THREE.Vector3(t.x, t.top + LABEL_LIFT, 0),
      node: (
        <div
          className="whitespace-nowrap rounded-full bg-white/90 px-3.5 py-1 text-center shadow-sm ring-1 ring-black/5 transition-opacity duration-300"
          style={{ ...headingFont, opacity: !focus || focus.id === t.id ? 1 : 0.4 }}
        >
          <div className="text-[9px] font-medium uppercase leading-tight tracking-[0.16em] text-[#5b6072]">{projectName}</div>
          <div className="text-[13px] font-semibold leading-tight text-[#1C2033]">{t.name}</div>
        </div>
      ),
    }));
    if (focus)
      for (let f = 0; f < focus.floors; f += focus.floors > 30 ? 2 : 1)
        out.push({
          key: "floor-" + f,
          pos: new THREE.Vector3(focus.x - focus.width / 2 - 0.5, PODIUM_H + f * FLOOR_H + FLOOR_H / 2, focus.depth / 2 + 0.3),
          node: (
            <div className="min-w-5 rounded-md bg-white/85 px-1 text-center text-[10px] font-medium leading-[14px] tabular-nums text-[#5b6072] shadow-sm" style={headingFont}>
              {f === 0 ? "G" : f}
            </div>
          ),
        });
    if (hovered)
      out.push({
        key: "tooltip",
        pos: new THREE.Vector3(hovered.pos.x, hovered.pos.y + 0.6, hovered.pos.z + hovered.nz * 0.4),
        node: (
          <div className="whitespace-nowrap rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5">
            <div className="text-sm font-semibold text-[#1C2033]" style={headingFont}>
              {hovered.unit.label ?? hovered.unit.number}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#5b6072]">
              <span className="size-2 rounded-full" style={{ background: STATUS_HEX[hovered.unit.status] }} />
              {STATUS_LABELS[hovered.unit.status]} · {hovered.unit.floor === 0 ? "Ground" : `Floor ${hovered.unit.floor}`}
            </div>
          </div>
        ),
      });
    return out;
  }, [layout, focus, hovered, projectName]);

  return (
    <div style={{ height, background: GROUND, touchAction: "none" }} className="relative w-full overflow-hidden">
      <Canvas frameloop="demand" flat dpr={[1, 2]} camera={{ fov: 30, near: 0.5, far: 1000, position: [20, 20, 60] }}>
        <Scene
          layout={layout}
          blocks={blocks}
          accent={accent}
          selectedId={selectedId}
          onSelect={onSelect}
          hovered={hovered}
          setHovered={setHovered}
          focusTowerId={focusTowerId}
          maxDist={maxDist}
          setMaxDist={setMaxDist}
          anchors={anchors}
          els={els}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
        {anchors.map((a) => (
          <div
            key={a.key}
            className={`absolute top-0 left-0 ${a.key === "tooltip" ? "z-10" : ""}`}
            style={{ visibility: "hidden" }}
            ref={(el) => {
              if (el) els.current.set(a.key, el);
              else els.current.delete(a.key);
            }}
          >
            {a.node}
          </div>
        ))}
      </div>
    </div>
  );
}
