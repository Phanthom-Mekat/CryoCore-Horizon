// Hand-off between the assistant panel and the Explore map, for what the URL doesn't hold: the tapped point and the
// shown layer (the assistant's context, shown in its panel), and the assistant's map commands, applied at once when
// Explore is open or when it next opens.
import { useSyncExternalStore } from "react";
import type { LayerId } from "./case-api";

export type MapCommand = { layer?: LayerId | "quicklook"; point?: [number, number] };
export type MapContext = { point: [number, number] | null; layer: string | null };

const NONE: MapContext = { point: null, layer: null };
const COMMAND = "cryo-map-command";
const CONTEXT = "cryo-map-context";
let pending: MapCommand | null = null;
let context = NONE;

export function sendToMap(command: MapCommand) {
  pending = { ...pending, ...command };
  window.dispatchEvent(new Event(COMMAND));
}

/** The command waiting for the map, if any; taking it clears it. */
export function takeMapCommand() {
  const c = pending;
  pending = null;
  return c;
}

export function onMapCommand(fn: () => void) {
  window.addEventListener(COMMAND, fn);
  return () => window.removeEventListener(COMMAND, fn);
}

/** Explore reports what it shows; null clears it when Explore closes. */
export function setMapContext(next: MapContext | null) {
  context = next ?? NONE;
  window.dispatchEvent(new Event(CONTEXT));
}

const subscribe = (fn: () => void) => {
  window.addEventListener(CONTEXT, fn);
  return () => window.removeEventListener(CONTEXT, fn);
};
export const useMapContext = () => useSyncExternalStore(subscribe, () => context, () => NONE);
