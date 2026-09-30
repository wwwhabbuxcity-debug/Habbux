# ADR 0017: DOM interface over the PixiJS game renderer

- Status: accepted
- Date: 2026-09-29

## Context

The Habbux client uses PixiJS for a game viewport while future interfaces need
forms, text, windows, menus, and keyboard/touch behavior. Rendering conventional
controls into the game canvas would require reimplementing browser semantics and
make text and accessibility harder to maintain. UI updates also must not recreate
the renderer or follow every high-frequency game event.

## Decision

Use PixiJS for the game world and DOM/CSS for conventional UI. Keep their layers
separate in one TypeScript client. UI calls client-facing controllers and reads
snapshots; it does not send protocol frames or mutate domain state. Overlay
containers allow pointer events through to the game except where a visible
control consumes them.

## Consequences

- Native DOM controls provide browser focus, form, text, and accessibility behavior.
- CSS custom properties can change theme values without rebuilding Pixi assets.
- Renderer sizing and world rendering stay independent from UI window state.
- Overlay positioning, stacking, and lifecycle need a shared small system.
- DOM count and reflow still need explicit limits; DOM is not assumed to be free.
- The existing diagnostic page remains available for connection/auth/room work.

## Limits

This decision does not define a final art direction, guarantee performance on
low-end devices, or implement planned game features. Browser checks are
development validation; device profiling remains future work.
