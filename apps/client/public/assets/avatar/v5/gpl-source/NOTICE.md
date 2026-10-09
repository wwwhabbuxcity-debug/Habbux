# Corresponding source and license

Source repository: Octane Renderer, https://github.com/duckietm/Octane-Renderer.
Local source: `/var/www/gallaxys.com/Octane-Renderer/packages/avatar/src/data/HabboAvatarAnimations.ts`.
Repository package declares GPL-3.0; complete repository LICENSE preserved as COPYING.
Octane Renderer acknowledges derivation from Nitro Renderer / Nitro React in its README.
Individual authors of these static animation definitions are not separately identified.

HabboAvatarAnimations.ts is the verbatim corresponding source. The original Habbux
converter parses its AST without executing it. Only Default frame0 and Move frames0..3
for parts supported by the Habbux avatar are emitted into native runtime data.
The converted profile remains GPL-3.0; no MIT or graphic asset license is assigned.
The renderer source is included to reproduce the conversion and honor source/license
requirements. Its other animations are not imported into the client runtime.

This grant is limited to the source definitions in the licensed repository. It does
not establish rights to Sulake graphics, the separate gamedata configuration files,
Nitro PNGs, or figure libraries. No new graphic pixels are imported here.
