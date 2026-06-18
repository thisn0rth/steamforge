/**
 * Overlay document schema.
 *
 * An overlay is an After Effects-style composition: a fixed-size canvas with a
 * stack of layers. Each layer has transform + type-specific properties, any of
 * which can be animated with keyframes over a timeline. Overlays render as web
 * pages that are loaded as OBS browser sources, and they can bind to live CS2
 * GSI data via data bindings.
 */

export type LayerType = 'text' | 'image' | 'shape' | 'gsiText' | 'group';

export type EasingKind = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

/** A single animation keyframe for one numeric/color property. */
export interface Keyframe {
  /** Time in milliseconds from the start of the composition. */
  time: number;
  value: number | string;
  easing: EasingKind;
}

/** An animatable property: either a static value or a keyframed track. */
export interface AnimatableProperty<T = number | string> {
  value: T;
  keyframes?: Keyframe[];
}

export interface LayerTransform {
  x: AnimatableProperty<number>;
  y: AnimatableProperty<number>;
  width: AnimatableProperty<number>;
  height: AnimatableProperty<number>;
  rotation: AnimatableProperty<number>;
  opacity: AnimatableProperty<number>;
  scale: AnimatableProperty<number>;
}

export interface TextLayerProps {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
}

export interface ImageLayerProps {
  src: string;
  fit: 'contain' | 'cover' | 'fill';
}

export interface ShapeLayerProps {
  shape: 'rect' | 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

/**
 * Binds a layer's content to data. Two modes:
 *
 * 1. Direct GSI: `path` is a path into the live GSI payload, e.g.
 *    `map.team_ct.score`, `player.state.health`, or the virtual player
 *    namespace `players.ct.1.state.health`.
 * 2. Slot-relative: when `slotId` is set, `path` is resolved against the entity
 *    assigned to that overlay slot at use-time, prefixed by dataset:
 *    `gsi.state.health` (live game data) or `fs.avgKills` (Firestore league
 *    data). This is what powers "focus" overlays: design once with a slot, then
 *    pick the concrete player/team/match when the overlay is used.
 */
export interface GsiBinding {
  path: string;
  /** Optional printf-style/template, e.g. "{value} HP". `{value}` is replaced. */
  template?: string;
  fallback?: string;
  /** When set, `path` is resolved against this overlay slot's assigned entity. */
  slotId?: string;
}

/** The kind of entity an overlay slot accepts. */
export type SlotKind = 'player' | 'team' | 'match';

/**
 * A declared data slot ("role") on an overlay. Bindings reference a slot
 * instead of a concrete entity; the concrete player/team/match is chosen at
 * use-time (on select / push to preview / rig activation).
 */
export interface OverlaySlot {
  id: string;
  label: string;
  kind: SlotKind;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
  /** Type-specific properties (only the matching one is used). */
  text?: TextLayerProps;
  image?: ImageLayerProps;
  shape?: ShapeLayerProps;
  binding?: GsiBinding;
  /** Child layer ids for `group` layers. */
  children?: string[];
}

export interface OverlayComposition {
  width: number;
  height: number;
  /** Composition duration in ms (used for the editor timeline / loops). */
  duration: number;
  /** Frames per second used for timeline display + keyframe snapping. */
  fps: number;
  background: string;
}

export interface Overlay {
  id: string;
  name: string;
  description?: string;
  composition: OverlayComposition;
  layers: Layer[];
  /** Declared data slots ("focus" roles) bindings can reference. */
  slots?: OverlaySlot[];
  /** Default slot assignment baked into the overlay (overridable at use-time). */
  defaultAssignments?: OverlayAssignments;
  createdAt: number;
  updatedAt: number;
}

/**
 * Resolves an overlay slot to concrete entities at use-time. A player slot can
 * carry both a live GSI reference and a Firestore document id so one slot
 * exposes live + league data together.
 */
export interface SlotAssignment {
  /** GSI reference, e.g. `players.ct.1` (player) or `ct`/`t` (team). */
  gsiRef?: string;
  /** Firestore document id within the slot kind's collection. */
  fsId?: string;
}

/** slotId -> assignment for a single overlay. */
export type OverlayAssignments = Record<string, SlotAssignment>;
