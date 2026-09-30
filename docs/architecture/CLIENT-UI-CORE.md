# Habbux Client UI Core v1

Status: **foundation in development**. This document records the technical
boundaries for the in-game interface. It is not a final visual identity and does
not implement Navigator, Friends, Inventory, Profile, Catalog, or settings.

## Rendering boundary

PixiJS owns the game canvas and pixel world. Conventional interface controls use
DOM elements and CSS so browser semantics, keyboard focus, labels, and text
selection remain available. The overlay root is transparent to pointer input;
only windows, toolbar buttons, and active overlays receive pointer events. The
decision is recorded in [ADR 0017](../adr/0017-dom-ui-pixi-renderer.md).

The `CoreConnection` is the client-facing action and state API for connection,
authentication, and the current Room Core. UI code calls its methods and
subscribes to immutable snapshots; it does not encode frames or mutate room
state. The window manager owns only transient presentation state.

## Design system

`apps/client/src/ui/tokens.css` defines the neutral default theme with CSS custom
properties for color, surfaces, spacing, radius, borders, shadows, blur,
typography, motion, touch target, breakpoints, and layer order. Components refer
to repeated decisions through those tokens. The theme is selected with
`data-hbx-theme`; no preference or credential is written to local storage.

`components.css` contains DOM primitives and shared overlays. Solid surfaces are
the default. Translucent and glass surfaces are opt-in; blur exists in one CSS
rule, has an `@supports` fallback, and is disabled for coarse pointers, reduced
quality, and reduced-motion environments. `prefers-reduced-motion` also removes
transitions and animation. No runtime CSS-in-JS or UI state library is used.

The current primitives are Button, IconButton, Icon, Input, TextArea, Checkbox,
Toggle, Badge, Divider, Surface, ScrollArea, and Tooltip. Buttons and fields use
native elements, provide visible keyboard focus, and target at least 44 CSS
pixels. The Icon primitive reserves a named slot for future Habbux SVG assets;
it does not use emoji as a final icon set.

## Window and overlay model

`WindowManager` owns windows by stable ID, rejects accidental duplicates,
supports deliberate instances, orders focus with compact integer z-order, and
clamps positions to the viewport. Desktop uses floating windows, intermediate
widths use a panel, and narrow or short viewports use a sheet. Drag uses pointer
events, requestAnimationFrame coalescing, and transforms. Keyboard users can
focus a title bar and use Alt + arrow keys to move a window.

Overlay layers are centralized as windows, popovers, and notifications. Modal
uses the native `dialog` element and Escape; popovers and context menus are
positioned once on open and should be closed by their owning feature. Toasts are
limited to five visible entries and share one expiration timer. Future
components should use these helpers rather than inventing z-index values.

## Responsive HUD and input

There is one TypeScript client. CSS media queries handle layout. The manager
uses only two width transitions (672 and 1024 CSS pixels) and a short-viewport
check to choose a window presentation. HUD examples use all four safe-area
insets and `dvh`/`svh` where viewport height matters. The UI Lab toolbar is a
layout prototype; its labels compact at mobile widths and remain usable by touch.

## Room chat and state ownership

The development UI Lab can connect to the configured Core endpoint, authenticate,
join a room, and send/receive actual Room Core chat through `CoreConnection`.
It never calls the socket or protocol codec itself. Chat entries render through
`textContent`, retain user ID, username, message, local arrival timestamp, and a
45-second UI lifetime. History is capped at 50. A single scheduled cleanup
handles expiration; it does not create a timer per message. The Core's existing
50-message snapshot limit remains the server/client transport boundary. A
separate local-only chat demonstrates the same UI without claiming server
delivery.

Connection snapshots can arrive for hot events such as RTT or movement. The
diagnostic page now rebuilds the room grid only when the immutable room state
changes and rebuilds chat only when its list changes. Static layout and renderer
remain outside these updates.

## UI Lab and quality

Open `/client/?ui-lab` using the Vite development server. The entry checks
`import.meta.env.DEV`; production builds omit the Lab module and its DOM. It
demonstrates primitives, solid/translucent/glass surfaces, modal/popover/context
menu/toasts, movable windows, toolbar, local chat, and real Room Core chat.
Lightweight counters show active windows, visible notices/messages, approximate
DOM node count, quality mode, and viewport category.

The `reduced` quality mode removes blur and lowers shadows. It is an in-memory
Lab control, not a saved account preference. The baseline adds no dependency.
Bundle sizes, viewport screenshots, and the 1,000-window / 10,000-notification
stress checks are recorded in the release report; browser pixel results are not
a performance benchmark for physical low-end devices.

## Accessibility and security

Labels are associated with inputs, state is announced where appropriate,
controls use native button/form elements, and focus is visible. Tooltip content
also appears on keyboard focus. Chat is always plain text. Authentication
password inputs are cleared before the login request and no authentication
material is stored in local storage or written to logs. Event subscriptions,
ResizeObserver, timers, and renderer resources have explicit cleanup paths.
