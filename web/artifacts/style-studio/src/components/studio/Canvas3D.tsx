import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Avatar, CatalogItem, LookSelections } from '@workspace/api-client-react';
import { UserCircle, RotateCcw } from 'lucide-react';

/** Realistic human base model — served lazily from public assets (never bundled). */
const MODEL_URL = `${import.meta.env.BASE_URL}models/human_relaxed.glb`;
useGLTF.preload(MODEL_URL);

/** Facial customization option sets — shared with the styling rail UI. */
export const SKIN_TONES = ['#F7D7C4', '#F2C2A0', '#E3AA82', '#C68863', '#9C6644', '#6F4A32'];
export const EYEBROW_COLORS = ['#2b2320', '#4a3524', '#6b4a2f', '#8a6a45', '#111111', '#9a9a9a'];
export const EYEBROW_STYLES: { key: string; label: string }[] = [
  { key: 'natural', label: 'Natural' },
  { key: 'thick', label: 'Thick' },
  { key: 'arched', label: 'Arched' },
  { key: 'flat', label: 'Flat' },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type V3 = [number, number, number];
type Focus = 'face' | 'torso' | 'feet' | null;

/** Per-vertex body-part classes computed from the mesh itself. */
const CL_TORSO = 0, CL_HEAD = 1, CL_ARM = 2, CL_LEG = 3, CL_FOOT = 4;

/**
 * Loads a face photo into a feathered CanvasTexture so its edges fade into the
 * skin instead of showing a hard rectangular seam. Returns null until ready.
 */
function useFeatheredFaceTexture(url: string | null | undefined): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) { setTex(null); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) { setTex(null); return; }
      // Zoom into the central face region (portraits usually frame the face
      // in the upper-center) so backgrounds/shoulders don't end up on the head.
      const scale = Math.max(size / img.width, size / img.height) * 2.2;
      const w = img.width * scale, h = img.height * scale;
      // Positive Y offset shifts the image down → the crop window shows the
      // UPPER part of the portrait (the face), not the collar/shoulders.
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2 + h * 0.12, w, h);
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.30, size / 2, size / 2, size * 0.5);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.72, 'rgba(0,0,0,0.9)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      setTex(t);
    };
    img.onerror = () => { if (!cancelled) setTex(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);
  return tex;
}

/**
 * Loads an arbitrary photo (e.g. a real shirt) into a center-cropped square
 * CanvasTexture usable as a garment material map.
 */
function usePhotoTexture(url: string | null | undefined): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) { setTex(null); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const size = 512;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) { setTex(null); return; }
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      // Feather the edges so the panel melts into the garment instead of
      // showing hard corners that slice through the shirt surface.
      const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.52);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.8, 'rgba(0,0,0,0.95)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      setTex(t);
    };
    img.onerror = () => { if (!cancelled) setTex(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);
  return tex;
}

/** Average color of a (data-URL) image — used to "scan" an item's color from a photo. */
function useDominantColor(url: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setColor(null); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const n = 16;
      const c = document.createElement('canvas');
      c.width = n; c.height = n;
      const ctx = c.getContext('2d');
      if (!ctx) { setColor(null); return; }
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      // Weighted average favoring saturated pixels so the item's color wins
      // over white/gray backgrounds.
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const w = 0.15 + (mx - mn) / 255 + (mx > 40 && mx < 230 ? 0.3 : 0);
        r += R * w; g += G * w; b += B * w; wsum += w;
      }
      if (wsum <= 0) { setColor('#555555'); return; }
      const hex = (v: number) => Math.round(clamp(v / wsum, 0, 255)).toString(16).padStart(2, '0');
      setColor(`#${hex(r)}${hex(g)}${hex(b)}`);
    };
    img.onerror = () => { if (!cancelled) setColor(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return color;
}

/** A convex patch that hugs a curved surface (face photo or shirt photo). */
function CurvedDecal({ texture, w, h, curve, center, rotation }: { texture: THREE.Texture; w: number; h: number; curve: number; center: V3; rotation?: V3 }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, 24, 24);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const R = curve;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const z = Math.sqrt(Math.max(0, R * R - x * x - y * y)) - R;
      pos.setZ(i, z * 0.9);
    }
    g.computeVertexNormals();
    return g;
  }, [w, h, curve]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} position={center} rotation={rotation} castShadow>
      <meshStandardMaterial map={texture} transparent depthWrite={false} roughness={0.6} metalness={0} polygonOffset polygonOffsetFactor={-3} />
    </mesh>
  );
}

interface BodyData {
  /** Non-indexed local-space vertex data baked from the GLB. */
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array | null;
  vclass: Uint8Array;
  /** yf (0 feet → 1 head-top) per vertex, for cheap range predicates. */
  yfrac: Float32Array;
  /** |lateral offset| per vertex + the measured leg outer edge, for hand/leg splits. */
  latAbs: Float32Array;
  legMax: number;
  /** Local-space vertical bounds, to convert height fractions → local Y. */
  minY: number;
  heightL: number;
  /** Inflated position variants (garments sit just off the skin). */
  posPants: Float32Array;
  posShirt: Float32Array;
  posShoes: Float32Array;
  baseMaterial: THREE.MeshStandardMaterial;
  /** Normalization transform: local GLB space → world (feet at 0, facing +Z, height H). */
  scale: number;
  rotY: number;
  offset: V3;
  /** World-space anchors measured from the actual mesh. */
  yHeadCenter: number;
  rHead: number;
  rHeadLat: number;
  headTopY: number;
  headFrontZ: number;
  chestFrontZ: number;
}

/**
 * Bakes the GLB into flat vertex arrays, auto-orients it (finds the lateral /
 * forward axes from the mesh itself), classifies each vertex into a body part
 * (head / torso / arm / leg / foot) and precomputes inflated position layers
 * used to cut form-fitting clothing straight from the body surface.
 */
function useBodyData(gltf: { scene: THREE.Group }, H: number): BodyData {
  return useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const posChunks: Float32Array[] = [];
    const nrmChunks: Float32Array[] = [];
    const uvChunks: (Float32Array | null)[] = [];
    let baseMaterial: THREE.MeshStandardMaterial | null = null;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!baseMaterial) baseMaterial = m.material as THREE.MeshStandardMaterial;
      let g = m.geometry as THREE.BufferGeometry;
      if (g.index) g = g.toNonIndexed();
      const p = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const worldP = new Float32Array(p.length);
      const v = new THREE.Vector3();
      for (let i = 0; i < p.length; i += 3) {
        v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m.matrixWorld);
        worldP[i] = v.x; worldP[i + 1] = v.y; worldP[i + 2] = v.z;
      }
      posChunks.push(worldP);
      const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      const nAttr = g.attributes.normal as THREE.BufferAttribute | undefined;
      const worldN = new Float32Array(p.length);
      if (nAttr) {
        const n = nAttr.array as Float32Array;
        for (let i = 0; i < n.length; i += 3) {
          v.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(nm).normalize();
          worldN[i] = v.x; worldN[i + 1] = v.y; worldN[i + 2] = v.z;
        }
      }
      nrmChunks.push(worldN);
      const uvAttr = g.attributes.uv as THREE.BufferAttribute | undefined;
      uvChunks.push(uvAttr ? new Float32Array(uvAttr.array as Float32Array) : null);
    });

    const total = posChunks.reduce((a, c) => a + c.length, 0);
    const pos = new Float32Array(total);
    const nrm = new Float32Array(total);
    const uv = uvChunks.every(Boolean) ? new Float32Array((total / 3) * 2) : null;
    let off = 0, uvOff = 0;
    posChunks.forEach((c, i) => {
      pos.set(c, off); nrm.set(nrmChunks[i], off);
      if (uv && uvChunks[i]) { uv.set(uvChunks[i]!, uvOff); uvOff += uvChunks[i]!.length; }
      off += c.length;
    });

    // Bounding box in local space.
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
      minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    }
    const heightL = Math.max(1e-6, maxY - minY);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const n = pos.length / 3;
    const yfrac = new Float32Array(n);
    for (let i = 0; i < n; i++) yfrac[i] = (pos[i * 3 + 1] - minY) / heightL;

    // Lateral axis = horizontal axis with the larger extent in the shoulder band.
    let exX = 0, exZ = 0;
    for (let i = 0; i < n; i++) {
      const yf = yfrac[i];
      if (yf < 0.7 || yf > 0.84) continue;
      exX = Math.max(exX, Math.abs(pos[i * 3] - cx));
      exZ = Math.max(exZ, Math.abs(pos[i * 3 + 2] - cz));
    }
    const latIsX = exX >= exZ;
    const lat = (i: number) => (latIsX ? pos[i * 3] - cx : pos[i * 3 + 2] - cz);
    const fwd = (i: number) => (latIsX ? pos[i * 3 + 2] - cz : pos[i * 3] - cx);

    // Forward sign from the toes (feet extend forward at ground level).
    let fwdSum = 0, fwdCnt = 0;
    for (let i = 0; i < n; i++) if (yfrac[i] < 0.05) { fwdSum += fwd(i); fwdCnt++; }
    const fwdSign = fwdSum >= 0 || fwdCnt === 0 ? 1 : -1;
    // Rotation about Y mapping local forward axis to world +Z.
    const rotY = latIsX ? (fwdSign > 0 ? 0 : Math.PI) : (fwdSign > 0 ? -Math.PI / 2 : Math.PI / 2);

    // Leg outer edge (shin band — hands never hang that low) → arm split.
    let legMax = 0;
    const latAbs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      latAbs[i] = Math.abs(lat(i));
      if (yfrac[i] > 0.2 && yfrac[i] < 0.34) legMax = Math.max(legMax, latAbs[i]);
    }
    const armSplit = legMax * 1.12;

    const vclass = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const yf = yfrac[i];
      if (yf > 0.855) vclass[i] = CL_HEAD;
      else if (yf < 0.075) vclass[i] = CL_FOOT;
      else if (Math.abs(lat(i)) > armSplit && yf < 0.83) vclass[i] = CL_ARM;
      else if (yf < 0.5) vclass[i] = CL_LEG;
      else vclass[i] = CL_TORSO;
    }

    // Inflated garment layers (in local units; pants under shirt to avoid z-fighting).
    const mk = (amount: number) => {
      const out = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i++) out[i] = pos[i] + nrm[i] * amount;
      return out;
    };
    const posPants = mk(0.005 * heightL);
    const posShirt = mk(0.008 * heightL);
    const posShoes = mk(0.014 * heightL);

    const scale = H / heightL;
    // Offset must account for the Y-rotation applied to the group (world = T + Ry·S·local).
    const ca = Math.cos(rotY), sa = Math.sin(rotY);
    const rcx = cx * ca + cz * sa;
    const rcz = -cx * sa + cz * ca;
    // Anchors measured from the actual head vertices.
    let hMinY = Infinity, hMaxY = -Infinity, hLat = 0, hFwdMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (vclass[i] !== CL_HEAD) continue;
      const y = pos[i * 3 + 1];
      hMinY = Math.min(hMinY, y); hMaxY = Math.max(hMaxY, y);
      hLat = Math.max(hLat, Math.abs(lat(i)));
      hFwdMax = Math.max(hFwdMax, fwd(i) * fwdSign);
    }
    let cFwdMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (vclass[i] === CL_TORSO && yfrac[i] > 0.62 && yfrac[i] < 0.74) cFwdMax = Math.max(cFwdMax, fwd(i) * fwdSign);
    }
    const yHeadCenter = ((hMinY + hMaxY) / 2 - minY) * scale;
    const rHead = Math.max(hLat, (hMaxY - hMinY) / 2) * scale;
    // Lateral half-width + top of head: tighter anchors for hair/brows —
    // the vertical extent includes the neck band so rHead runs large.
    const rHeadLat = hLat * scale;
    const headTopY = (hMaxY - minY) * scale;
    const headFrontZ = (isFinite(hFwdMax) ? hFwdMax : 0.05 * heightL) * scale;
    const chestFrontZ = (isFinite(cFwdMax) ? cFwdMax : 0.08 * heightL) * scale;

    return {
      pos, nrm, uv, vclass, yfrac, latAbs, legMax, minY, heightL, posPants, posShirt, posShoes,
      baseMaterial: (baseMaterial ?? new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial,
      scale, rotY, offset: [-rcx * scale, -minY * scale, -rcz * scale] as V3,
      yHeadCenter, rHead, rHeadLat, headTopY, headFrontZ, chestFrontZ,
    };
  }, [gltf, H]);
}

interface ClipVert { p: number[]; n: number[]; t: number[] }

/** Sutherland–Hodgman clip of a polygon against a horizontal plane (local Y). */
function clipPolyY(poly: ClipVert[], yBound: number, keepAbove: boolean): ClipVert[] {
  const out: ClipVert[] = [];
  const inside = (v: ClipVert) => (keepAbove ? v.p[1] >= yBound : v.p[1] <= yBound);
  const lerpV = (a: ClipVert, b: ClipVert): ClipVert => {
    const s = (yBound - a.p[1]) / (b.p[1] - a.p[1] || 1e-9);
    const mix = (x: number[], y1: number[]) => x.map((v, i) => v + (y1[i] - v) * s);
    return { p: mix(a.p, b.p), n: mix(a.n, b.n), t: a.t.length ? mix(a.t, b.t) : [] };
  };
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const cIn = inside(cur), pIn = inside(prev);
    if (cIn) {
      if (!pIn) out.push(lerpV(prev, cur));
      out.push(cur);
    } else if (pIn) {
      out.push(lerpV(prev, cur));
    }
  }
  return out;
}

/**
 * Builds a BufferGeometry from triangles passing `pred`. Mode 'all' keeps a
 * triangle only when all 3 vertices pass (tight cut); 'any' keeps it when at
 * least one passes. Optional yMinL/yMaxL (local Y) cut triangles *exactly* at
 * horizontal planes so garment hems and sleeve ends are clean straight lines.
 */
function buildLayerGeometry(
  body: BodyData,
  positions: Float32Array,
  pred: (i: number) => boolean,
  mode: 'all' | 'any' = 'all',
  yMinL?: number,
  yMaxL?: number,
): THREE.BufferGeometry | null {
  const { nrm, uv } = body;
  const triCount = positions.length / 9;
  const p: number[] = [], nn: number[] = [], tuv: number[] = [];
  const pushTri = (a: ClipVert, b: ClipVert, c: ClipVert) => {
    for (const v of [a, b, c]) { p.push(...v.p); nn.push(...v.n); if (uv) tuv.push(...v.t); }
  };
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const pass = mode === 'all'
      ? pred(i0) && pred(i0 + 1) && pred(i0 + 2)
      : pred(i0) || pred(i0 + 1) || pred(i0 + 2);
    if (!pass) continue;
    let poly: ClipVert[] = [0, 1, 2].map((k) => {
      const vi = (i0 + k) * 3, ui = (i0 + k) * 2;
      return {
        p: [positions[vi], positions[vi + 1], positions[vi + 2]],
        n: [nrm[vi], nrm[vi + 1], nrm[vi + 2]],
        t: uv ? [uv[ui], uv[ui + 1]] : [],
      };
    });
    if (yMinL !== undefined) poly = clipPolyY(poly, yMinL, true);
    if (yMaxL !== undefined && poly.length >= 3) poly = clipPolyY(poly, yMaxL, false);
    for (let k = 2; k < poly.length; k++) pushTri(poly[0], poly[k - 1], poly[k]);
  }
  if (p.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nn), 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tuv), 2));
  return g;
}

interface HumanProps {
  avatar: Avatar;
  selections: LookSelections;
  catalogItems: CatalogItem[];
  onFocus: (f: Focus) => void;
}

/** The realistic GLB body plus form-fitting clothing layers cut from its surface. */
function Human({ avatar, selections, catalogItems, onFocus }: HumanProps) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(MODEL_URL);

  // ---- Measurement-driven scaling ----
  const H = (avatar.heightCm / 175) * 1.8;
  const widthFactor = clamp(avatar.weightKg / 70, 0.82, 1.4);

  const body = useBodyData(gltf, H);
  const { vclass, yfrac, latAbs } = body;

  // ---- Skin tone (selection overrides avatar default; none = natural texture) ----
  const skinTone = selections.skinTone || avatar.skinTone || null;

  // Body render: skin parts (head/arms) separated so skin tone tints only them.
  const skinGeom = useMemo(
    () => buildLayerGeometry(body, body.pos, (i) => vclass[i] === CL_HEAD || vclass[i] === CL_ARM),
    [body, vclass],
  );
  // 'any' mode = complement of the skin cut → boundary triangles render once, no gaps.
  const restGeom = useMemo(
    () => buildLayerGeometry(body, body.pos, (i) => vclass[i] !== CL_HEAD && vclass[i] !== CL_ARM, 'any'),
    [body, vclass],
  );
  useEffect(() => () => { skinGeom?.dispose(); restGeom?.dispose(); }, [skinGeom, restGeom]);

  const skinMat = useMemo(() => {
    const m = body.baseMaterial.clone();
    if (skinTone) m.color = new THREE.Color(skinTone);
    m.roughness = Math.max(0.55, m.roughness ?? 0.7);
    m.metalness = 0;
    return m;
  }, [body, skinTone]);
  const restMat = useMemo(() => {
    const m = body.baseMaterial.clone();
    m.roughness = Math.max(0.55, m.roughness ?? 0.7);
    m.metalness = 0;
    return m;
  }, [body]);
  useEffect(() => () => { skinMat.dispose(); restMat.dispose(); }, [skinMat, restMat]);

  // ---- Style lookups (preserve existing data model) ----
  const getStyleInfo = (category: string) => {
    const itemId = selections[`${category}ItemId` as keyof LookSelections];
    const color = selections[`${category}Color` as keyof LookSelections] as string;
    const item = catalogItems.find((i) => i.id === itemId);
    return { styleKey: item?.styleKey as string | undefined, color };
  };
  const hair = getStyleInfo('hairstyle');
  const beard = getStyleInfo('beard');
  const shirt = getStyleInfo('shirt');
  const pants = getStyleInfo('pants');
  const shoes = getStyleInfo('shoes');

  const faceTexture = useFeatheredFaceTexture(avatar.facePhotoUrl);
  const shirtPhoto = usePhotoTexture(selections.shirtTextureUrl);
  // Pants/shoes/hat/glasses photos are "scanned" for their dominant color
  // (a photo patch on the legs reads as a stain, unlike the chest panel).
  const pantsPhotoColor = useDominantColor(selections.pantsTextureUrl);
  const shoesPhotoColor = useDominantColor(selections.shoesTextureUrl);
  const hatPhotoColor = useDominantColor(selections.hatTextureUrl);
  const glassesPhotoColor = useDominantColor(selections.glassesTextureUrl);

  // A scanned photo alone is enough to dress the character: fall back to a
  // default garment shape when no catalog item is selected.
  const shirtStyle = shirt.styleKey ?? (selections.shirtTextureUrl ? 'tee' : undefined);
  const pantsStyle = pants.styleKey ?? (selections.pantsTextureUrl ? 'jeans' : undefined);
  const shoesStyle = shoes.styleKey ?? (selections.shoesTextureUrl ? 'sneakers' : undefined);

  // ---- Materials: memoized with stable deps, disposed on change/unmount ----
  const makeMat = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...opts });
  const hairMat = useMemo(() => makeMat(hair.color || selections.eyebrowColor || '#2b2320', { roughness: 0.85 }), [hair.color, selections.eyebrowColor]);
  const beardMat = useMemo(() => makeMat(beard.color || '#2b2320', { roughness: 0.9 }), [beard.color]);
  const browMat = useMemo(() => makeMat(selections.eyebrowColor || '#2b2320', { roughness: 0.85 }), [selections.eyebrowColor]);
  // ---- Garment cut heights (fractions of height → local Y for exact cuts) ----
  const longSleeves = !!shirtStyle && ['oxford', 'hoodie', 'jacket'].includes(shirtStyle);
  const sleeveMinF = longSleeves ? 0.37 : 0.60;
  const pantsMinF = pantsStyle === 'shorts' ? 0.29 : 0.055;
  const shoesTopF = shoesStyle === 'boots' ? 0.14 : 0.09;
  const yL = (f: number) => body.minY + f * body.heightL;

  const shirtColor = shirtPhoto ? '#e8e8e8' : (shirt.color || '#4A6BFF');
  const shirtMat = useMemo(() => makeMat(shirtColor), [shirtColor]);
  const pantsColor = pantsPhotoColor || pants.color || '#2c3550';
  const pantsMat = useMemo(() => makeMat(pantsColor), [pantsColor]);
  const shoesColor = shoesPhotoColor || shoes.color || '#1a1a1a';
  const shoesMat = useMemo(() => makeMat(shoesColor, { roughness: 0.5 }), [shoesColor]);
  const hatMat = useMemo(() => makeMat(hatPhotoColor || '#37415c', { roughness: 0.8 }), [hatPhotoColor]);
  const glassesMat = useMemo(
    () => makeMat(glassesPhotoColor || '#15181d', { roughness: 0.25, metalness: 0.35 }),
    [glassesPhotoColor],
  );
  useEffect(() => {
    const owned = [hairMat, beardMat, browMat, shirtMat, pantsMat, shoesMat, hatMat, glassesMat];
    return () => owned.forEach((m) => m.dispose());
  }, [hairMat, beardMat, browMat, shirtMat, pantsMat, shoesMat, hatMat, glassesMat]);

  // ---- Form-fitting clothing geometry: generous class cut + exact hem clipping ----
  const shirtGeom = useMemo(() => {
    if (!shirtStyle) return null;
    // Hip verts below 0.5H are classified LEG — include them (minus the hands,
    // which hang beside the thighs) so the hem reaches the exact 0.47H cut.
    const hipLatMax = body.legMax * 1.15;
    return buildLayerGeometry(
      body, body.posShirt,
      (i) => (vclass[i] === CL_TORSO || (vclass[i] === CL_LEG && latAbs[i] <= hipLatMax)) && yfrac[i] >= 0.42 && yfrac[i] <= 0.88,
      'any', yL(0.47), yL(0.83),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, vclass, yfrac, latAbs, shirtStyle]);
  const sleeveGeom = useMemo(() => {
    if (!shirtStyle) return null;
    return buildLayerGeometry(body, body.posShirt, (i) => vclass[i] === CL_ARM && yfrac[i] >= sleeveMinF - 0.05 && yfrac[i] <= 0.88, 'any', yL(sleeveMinF), yL(0.83));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, vclass, yfrac, shirtStyle, sleeveMinF]);
  const pantsGeom = useMemo(() => {
    if (!pantsStyle) return null;
    // Exclude hands hanging beside the thighs: legs stay within ~1.15× the
    // measured shin outer edge laterally; hands sit further out.
    const legLatMax = body.legMax * 1.15;
    return buildLayerGeometry(body, body.posPants, (i) => {
      const yf = yfrac[i];
      if (vclass[i] === CL_LEG) return yf >= pantsMinF - 0.05 && latAbs[i] <= legLatMax;
      if (vclass[i] === CL_TORSO) return yf <= 0.58;
      return false;
    }, 'any', yL(pantsMinF), yL(0.53));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, vclass, yfrac, latAbs, pantsStyle, pantsMinF]);
  const shoesGeom = useMemo(() => {
    if (!shoesStyle) return null;
    return buildLayerGeometry(body, body.posShoes, (i) => vclass[i] === CL_FOOT || (vclass[i] === CL_LEG && yfrac[i] < shoesTopF + 0.05), 'any', undefined, yL(shoesTopF));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, vclass, yfrac, shoesStyle, shoesTopF]);
  useEffect(() => () => { shirtGeom?.dispose(); sleeveGeom?.dispose(); pantsGeom?.dispose(); shoesGeom?.dispose(); }, [shirtGeom, sleeveGeom, pantsGeom, shoesGeom]);

  // ---- Anchors measured from the mesh ----
  const { yHeadCenter, rHead, rHeadLat, headTopY, headFrontZ, chestFrontZ } = body;
  // Cap radius sized to the skull's lateral width, not the tall head band.
  const rCap = rHeadLat * 1.08;
  const yCap = headTopY - rCap * 0.55;
  const yBrow = yHeadCenter + rHead * 0.18;
  const y = (frac: number) => frac * H;
  const yChest = y(0.7);
  const yKnee = y(0.27);

  // Idle breathing.
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.scale.y = 1 + Math.sin(t * 1.4) * 0.004;
  });

  const stop = (f: Focus) => (e: any) => { e.stopPropagation(); onFocus(f); };

  // Eyebrow geometry per style.
  const browLen = selections.eyebrowStyle === 'flat' ? rHeadLat * 0.42 : rHeadLat * 0.36;
  const browThick = selections.eyebrowStyle === 'thick' ? rHeadLat * 0.08 : rHeadLat * 0.05;
  const browRot = selections.eyebrowStyle === 'arched' ? 0.25 : selections.eyebrowStyle === 'flat' ? 0 : 0.12;

  return (
    <group ref={groupRef}>
      <group scale={[widthFactor, 1, widthFactor]}>
        {/* Realistic body + form-fitting garments, all sharing the GLB-local transform */}
        <group rotation={[0, body.rotY, 0]} position={body.offset} scale={body.scale}>
          {/* NOTE: transform order — scale/rotation applied around the group. */}
          {skinGeom && <mesh geometry={skinGeom} material={skinMat} castShadow receiveShadow />}
          {restGeom && <mesh geometry={restGeom} material={restMat} castShadow receiveShadow />}
          {shirtGeom && <mesh geometry={shirtGeom} material={shirtMat} castShadow />}
          {sleeveGeom && <mesh geometry={sleeveGeom} material={shirtMat} castShadow />}
          {pantsGeom && <mesh geometry={pantsGeom} material={pantsMat} castShadow />}
          {shoesGeom && <mesh geometry={shoesGeom} material={shoesMat} castShadow />}
        </group>

        {/* Face photo blended onto the head front */}
        {faceTexture && (
          <CurvedDecal texture={faceTexture} w={rHead * 1.1} h={rHead * 1.45} curve={rHead * 1.3} center={[0, yHeadCenter + rHead * 0.06, headFrontZ * 0.9]} />
        )}

        {/* Eyebrows — only on the plain head; a face photo brings its own brows */}
        {selections.eyebrowStyle && !faceTexture && (
          <group>
            {[-1, 1].map((s) => (
              <mesh key={s} material={browMat} position={[s * rHeadLat * 0.42, yBrow, headFrontZ * 0.94]} rotation={[0, 0, -s * browRot]}>
                <boxGeometry args={[browLen, browThick, rHeadLat * 0.08]} />
              </mesh>
            ))}
          </group>
        )}

        {/* Hair — anchored to the top of the skull, sized to its lateral width */}
        {hair.styleKey && (
          <group position={[0, yCap, -rCap * 0.06]}>
            {hair.styleKey === 'buzz' && (
              <mesh material={hairMat} castShadow scale={[1.0, 0.75, 1.05]}>
                <sphereGeometry args={[rCap, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
              </mesh>
            )}
            {hair.styleKey === 'crew' && (
              <mesh material={hairMat} castShadow scale={[1.02, 0.9, 1.08]}>
                <sphereGeometry args={[rCap, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              </mesh>
            )}
            {hair.styleKey === 'pompadour' && (
              <group>
                <mesh material={hairMat} castShadow scale={[1.0, 0.85, 1.05]}>
                  <sphereGeometry args={[rCap, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                </mesh>
                <mesh material={hairMat} castShadow position={[0, rCap * 0.35, rCap * 0.45]} rotation={[-0.35, 0, 0]} scale={[0.85, 0.55, 0.7]}>
                  <sphereGeometry args={[rCap * 0.85, 20, 20]} />
                </mesh>
              </group>
            )}
            {hair.styleKey === 'curly' && (
              <mesh material={hairMat} castShadow position={[0, rCap * 0.12, 0]} scale={[1.12, 0.95, 1.12]}>
                <dodecahedronGeometry args={[rCap * 0.98, 1]} />
              </mesh>
            )}
            {hair.styleKey === 'bun' && (
              <group>
                <mesh material={hairMat} castShadow scale={[1.02, 0.85, 1.06]}>
                  <sphereGeometry args={[rCap, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                </mesh>
                <mesh material={hairMat} castShadow position={[0, rCap * 0.45, -rCap * 0.85]}>
                  <sphereGeometry args={[rCap * 0.4, 16, 16]} />
                </mesh>
              </group>
            )}
            {hair.styleKey === 'long' && (
              <group>
                <mesh material={hairMat} castShadow scale={[1.05, 0.95, 1.1]}>
                  <sphereGeometry args={[rCap, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                </mesh>
                <mesh material={hairMat} castShadow position={[0, -rCap * 1.3, -rCap * 0.7]} scale={[1.0, 1.0, 0.5]}>
                  <capsuleGeometry args={[rCap * 0.9, rCap * 1.6, 8, 20]} />
                </mesh>
              </group>
            )}
          </group>
        )}

        {/* Beard — hugs the jaw, sized to skull width */}
        {beard.styleKey && (
          <group position={[0, yHeadCenter - rHead * 0.42, headFrontZ * 0.7]}>
            {beard.styleKey === 'stubble' && <mesh material={beardMat} position={[0, -rCap * 0.05, 0]} scale={[1, 0.55, 0.35]}><sphereGeometry args={[rCap * 0.72, 16, 16]} /></mesh>}
            {beard.styleKey === 'goatee' && <mesh material={beardMat} position={[0, -rCap * 0.1, 0]} scale={[0.45, 0.65, 0.4]}><sphereGeometry args={[rCap * 0.5, 16, 16]} /></mesh>}
            {beard.styleKey === 'full' && <mesh material={beardMat} position={[0, -rCap * 0.05, -rCap * 0.08]} scale={[0.95, 0.8, 0.55]}><sphereGeometry args={[rCap * 0.8, 20, 20]} /></mesh>}
            {beard.styleKey === 'mustache' && <mesh material={beardMat} position={[0, rCap * 0.18, 0]} scale={[1, 0.28, 0.35]}><sphereGeometry args={[rCap * 0.4, 12, 12]} /></mesh>}
          </group>
        )}

        {/* Photo-to-shirt: front chest panel showing the uploaded shirt photo */}
        {shirtStyle && shirtPhoto && (
          <CurvedDecal texture={shirtPhoto} w={0.17 * H} h={0.2 * H} curve={0.22 * H} center={[0, yChest, chestFrontZ + 0.012 * H]} />
        )}

        {/* Scanned hat: baseball-style cap tinted to the photo's dominant color */}
        {selections.hatTextureUrl && (
          <group>
            <mesh material={hatMat} castShadow position={[0, headTopY - rCap * 0.3, 0]} scale={[1.06, 0.78, 1.12]}>
              <sphereGeometry args={[rCap * 1.12, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            </mesh>
            <mesh material={hatMat} castShadow position={[0, headTopY - rCap * 0.42, rCap * 0.95]} scale={[1, 1, 1.5]}>
              <cylinderGeometry args={[rCap * 0.78, rCap * 0.78, rCap * 0.07, 24]} />
            </mesh>
          </group>
        )}

        {/* Scanned sunglasses: lenses + bridge + temples tinted to the photo's color */}
        {selections.glassesTextureUrl && (
          <group position={[0, yHeadCenter + rHead * 0.12, 0]}>
            {[-1, 1].map((s) => (
              <mesh key={s} material={glassesMat} position={[s * rHeadLat * 0.36, 0, headFrontZ * 0.96]}>
                <boxGeometry args={[rHeadLat * 0.52, rHeadLat * 0.36, rCap * 0.06]} />
              </mesh>
            ))}
            <mesh material={glassesMat} position={[0, rHeadLat * 0.06, headFrontZ * 0.96]}>
              <boxGeometry args={[rHeadLat * 0.24, rHeadLat * 0.07, rCap * 0.05]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={`t${s}`} material={glassesMat} position={[s * rHeadLat * 0.68, rHeadLat * 0.04, headFrontZ * 0.5]} rotation={[0, s * 0.08, 0]}>
                <boxGeometry args={[rCap * 0.05, rHeadLat * 0.07, headFrontZ * 0.95]} />
              </mesh>
            ))}
          </group>
        )}

        {/* Transparent click-zones for zoom-to-part (head / torso / feet).
            NOTE: must be visible (opacity 0) — raycasting skips invisible meshes. */}
        <mesh position={[0, yHeadCenter, 0]} onClick={stop('face')}>
          <sphereGeometry args={[rHead * 1.8, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, yChest - 0.02 * H, 0]} onClick={stop('torso')}>
          <boxGeometry args={[0.42 * H, 0.34 * H, 0.3 * H]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, yKnee * 0.55, 0.02 * H]} onClick={stop('feet')}>
          <boxGeometry args={[0.34 * H, yKnee * 1.4, 0.32 * H]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Smoothly animates the camera + orbit target when a focus region changes. */
function CameraRig({ focus, H }: { focus: Focus; H: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as any;
  const anim = useRef<{ t: number; dur: number; fromPos: THREE.Vector3; fromTgt: THREE.Vector3; toPos: THREE.Vector3; toTgt: THREE.Vector3 } | null>(null);

  const goalFor = (f: Focus) => {
    const cy = (fr: number) => fr * H;
    switch (f) {
      case 'face': return { tgt: new THREE.Vector3(0, cy(0.93), 0), dist: H * 0.55 };
      case 'torso': return { tgt: new THREE.Vector3(0, cy(0.7), 0), dist: H * 0.9 };
      case 'feet': return { tgt: new THREE.Vector3(0, cy(0.08), 0), dist: H * 0.7 };
      default: return { tgt: new THREE.Vector3(0, cy(0.52), 0), dist: H * 1.5 };
    }
  };

  useEffect(() => {
    if (!controls) return;
    const g = goalFor(focus);
    const dir = new THREE.Vector3(0, 0, 1); // face the front on focus
    const toTgt = g.tgt.clone();
    const toPos = toTgt.clone().add(dir.multiplyScalar(g.dist));
    anim.current = {
      t: 0, dur: 0.7,
      fromPos: camera.position.clone(),
      fromTgt: controls.target.clone(),
      toPos, toTgt,
    };
    controls.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + delta / a.dur);
    const e = 1 - Math.pow(1 - a.t, 3); // easeOutCubic
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromTgt, a.toTgt, e);
    controls.update();
    if (a.t >= 1) { anim.current = null; controls.enabled = true; }
  });
  return null;
}

function Loader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">Loading model…</span>
      </div>
    </Html>
  );
}

class WebGLErrorBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.error('WebGL Canvas Error:', error); }
  render() { return this.state.hasError ? <>{this.props.fallback}</> : <>{this.props.children}</>; }
}

interface Canvas3DProps {
  avatar: Avatar;
  selections: LookSelections;
  catalogItems: CatalogItem[];
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function Canvas3D({ avatar, selections, catalogItems, canvasRef }: Canvas3DProps) {
  const [focus, setFocus] = useState<Focus>(null);
  const H = (avatar.heightCm / 175) * 1.8;

  const isWebGLSupported = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch { return false; }
  }, []);

  const fallback = (
    <div className="w-full h-full bg-[#FAF9F6] dark:bg-[#111] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-32 h-32 bg-secondary rounded-full flex items-center justify-center mb-6 shadow-inner overflow-hidden border-4 border-card-border">
        {avatar.facePhotoUrl ? (
          <img src={avatar.facePhotoUrl} alt="Face" className="w-full h-full object-cover" />
        ) : (
          <UserCircle className="w-16 h-16 text-muted-foreground" />
        )}
      </div>
      <h2 className="text-2xl font-bold font-serif mb-2 text-foreground">{avatar.name}</h2>
      <p className="text-muted-foreground max-w-sm mb-6">3D preview requires WebGL support, which is currently unavailable.</p>
      <div className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium">You can still customize, view sizes, and save looks.</div>
    </div>
  );

  if (!isWebGLSupported) return fallback;

  return (
    <WebGLErrorBoundary fallback={fallback}>
      <div className="w-full h-full relative bg-gradient-to-b from-[#FAF9F6] to-[#EFEAFE] dark:from-[#141018] dark:to-[#0d0b12]">
        {focus && (
          <button
            onClick={() => setFocus(null)}
            className="absolute bottom-24 md:bottom-28 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-background/85 backdrop-blur-md border border-border shadow-lg text-sm font-medium hover:bg-secondary transition-colors"
            data-testid="button-reset-view"
          >
            <RotateCcw className="w-4 h-4" /> Reset view
          </button>
        )}
        <Canvas
          shadows
          camera={{ position: [0, H * 0.55, H * 1.5], fov: 42 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, localClippingEnabled: true }}
          ref={canvasRef}
          onPointerMissed={() => setFocus(null)}
          onCreated={({ gl }) => {
            // Must be set on the renderer instance — passing it via Canvas gl
            // props does not reliably enable material clipping planes.
            gl.localClippingEnabled = true;
            if (import.meta.env.DEV) (window as unknown as { __studioGL?: THREE.WebGLRenderer }).__studioGL = gl;
          }}
        >
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#ffffff', '#d9d2ff', 0.5]} />
          <spotLight position={[3, 5, 4]} angle={0.5} penumbra={0.8} intensity={2.2} color="#fff6e8" castShadow shadow-mapSize={2048} shadow-bias={-0.0002} />
          <spotLight position={[-4, 3, -2]} angle={0.6} penumbra={1} intensity={1.4} color="#5A3CFF" />
          <directionalLight position={[0, 2, -5]} intensity={0.5} color="#7c6bff" />

          <Suspense fallback={<Loader />}>
            <Human avatar={avatar} selections={selections} catalogItems={catalogItems} onFocus={setFocus} />
            <Environment preset="city" />
          </Suspense>

          <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={4} blur={2.4} far={3} />
          <OrbitControls
            makeDefault
            enablePan={false}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={Math.PI / 1.9}
            minDistance={H * 0.4}
            maxDistance={H * 3}
            target={[0, H * 0.52, 0]}
          />
          <CameraRig focus={focus} H={H} />
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}
