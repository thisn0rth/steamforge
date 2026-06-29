import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GsiPayload, GsiPlayer, LeagueData, ResolveContext } from '@streamforge/shared';
import { orderedPlayers } from '@streamforge/shared';

/**
 * Live data handed to a code/JSX overlay. The same fields are also injected as
 * bare variables (`gsi`, `ctPlayers`, …) so user code can reference them
 * directly.
 */
export interface OverlayData {
  gsi: GsiPayload | null;
  league: LeagueData | null;
  ctPlayers: GsiPlayer[];
  tPlayers: GsiPlayer[];
  allPlayers: GsiPlayer[];
  map: GsiPayload['map'] | null;
  round: GsiPayload['round'] | null;
  phase: GsiPayload['phase_countdowns'] | null;
  slots: ResolveContext['slots'];
  assignments: ResolveContext['assignments'];
}

function buildData(ctx: ResolveContext): OverlayData {
  const gsi = ctx.gsi;
  const ctPlayers = orderedPlayers(gsi, 'ct');
  const tPlayers = orderedPlayers(gsi, 't');
  return {
    gsi,
    league: ctx.league ?? null,
    ctPlayers,
    tPlayers,
    allPlayers: [...ctPlayers, ...tPlayers],
    map: gsi?.map ?? null,
    round: gsi?.round ?? null,
    phase: gsi?.phase_countdowns ?? null,
    slots: ctx.slots,
    assignments: ctx.assignments,
  };
}

const ERR_STYLE: CSSProperties = {
  margin: 0,
  padding: 16,
  color: '#ff6b73',
  font: '13px/1.5 ui-monospace, monospace',
  whiteSpace: 'pre-wrap',
};

type OverlayComponent = (props: { data: OverlayData }) => ReactNode;

/**
 * Base document for the layer's iframe. Loaded via `srcdoc` (rather than
 * `document.write`) so React mounts after a real load. `color-scheme: dark` is
 * required: Chrome otherwise paints a nested iframe with an opaque white base
 * (computed `background-color` reports transparent but it still renders white),
 * which would hide light overlay content. Dark scheme makes the base transparent.
 */
const BASE_DOC =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<style>html{color-scheme:dark}html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}</style>' +
  '</head><body></body></html>';

class ErrorBoundary extends Component<
  { children?: ReactNode; onError: (msg: string) => void },
  { msg: string | null }
> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    this.props.onError(err instanceof Error ? err.message : String(err));
  }
  render() {
    if (this.state.msg) return createElement('pre', { style: ERR_STYLE }, this.state.msg);
    return this.props.children;
  }
}

/**
 * Renders a custom JSX/React overlay layer. The user writes the body of a React
 * component (helper components + a final `return`); we transpile the JSX with a
 * lazily-loaded Babel, run it with the app's React + hooks and a live `data`
 * object in scope, and render it into an isolated iframe so `position: fixed` /
 * `100vw`/`100vh` map to the layer box (full composition by default) and pasted
 * styles stay contained. The component re-renders as data changes; hook state
 * and animations persist between updates.
 */
export function CodeLayer({ code, ctx }: { code: string; ctx: ResolveContext }) {
  const rootRef = useRef<Root | null>(null);
  const compRef = useRef<OverlayComponent | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recompute only when the underlying data actually changes (not every frame).
  const data = useMemo(
    () => buildData(ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.gsi, ctx.league, ctx.assignments, ctx.slots],
  );

  // Always-fresh paint closure so the async compile + data effects never use a
  // stale `data`/`error`/`code`.
  const paintRef = useRef<() => void>(() => undefined);
  paintRef.current = () => {
    const root = rootRef.current;
    if (!root) return;
    if (error) {
      root.render(createElement('pre', { style: ERR_STYLE }, error));
      return;
    }
    const Comp = compRef.current;
    if (!Comp) return;
    root.render(
      createElement(
        ErrorBoundary,
        { key: code, onError: setError },
        createElement(Comp, { data }),
      ),
    );
  };

  // Mount a React root on the iframe document once it has loaded its srcdoc.
  useEffect(() => {
    if (!doc?.body) return;
    const root = createRoot(doc.body);
    rootRef.current = root;
    paintRef.current();
    return () => {
      root.unmount();
      rootRef.current = null;
    };
  }, [doc]);

  // Compile when the code changes.
  useEffect(() => {
    let active = true;
    setError(null);
    void (async () => {
      try {
        const Babel = await import('@babel/standalone');
        // Wrap the user's component body in a function *before* transpiling so
        // its top-level `return <jsx/>` is legal, then evaluate to a factory.
        const wrapped =
          '(function(React, data){' +
          'const {useState,useEffect,useRef,useMemo,useCallback,useReducer,Fragment}=React;' +
          'const {gsi,league,ctPlayers,tPlayers,allPlayers,map,round,phase,assignments}=data;' +
          code +
          '\n})';
        const out = Babel.transform(wrapped, { presets: ['react'], filename: 'overlay.jsx' });
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        const factory = new Function('return ' + (out.code ?? ''))() as (
          react: typeof React,
          data: OverlayData,
        ) => ReactNode;
        if (!active) return;
        compRef.current = (props) => factory(React, props.data) as ReactElement;
        paintRef.current();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  // Repaint on data / error changes.
  useEffect(() => {
    paintRef.current();
  }, [data, error]);

  return (
    <iframe
      title="code-layer"
      srcDoc={BASE_DOC}
      onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
      style={{
        width: '100%',
        height: '100%',
        border: 0,
        background: 'transparent',
        colorScheme: 'dark',
        pointerEvents: 'none',
      }}
    />
  );
}
