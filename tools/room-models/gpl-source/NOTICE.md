# Polaris room model definitions — GPL-3.0

Source: `/var/www/gallaxys.com/Polaris-Emulator-main/Database/Default Database/CleanDB.sql`.
Polaris identifies itself as a fork of Arcturus Community; individual model
creators are not separately identified in this SQL. Repository root LICENSE
contains GPL version 3 and Emulator/pom.xml names GNU GPL v3.0. README explicitly
includes the ready-to-import database in the distributed package. No separate
model exclusion/license notice was found in the model table section.

`cleandb-models.json` contains only the 58 original heightmap/door definitions
needed by Habbux migration V5. Converted TSV changes IDs, canonicalizes line
endings and symbol case, and replaces the SQL packaging with native room model
fields. Geometry, elevations and door coordinates/directions are preserved.
Changes made by Habbux contributors on 2026-10-09.

This subset and derived model definitions remain GPL-3.0; they are not MIT and
this notice does not relicense other Habbux code or PNG assets. COPYING retains
the full GPL text. Distributors must retain notices/license and supply the
corresponding source of these conversions (source JSON and migration/converter
scripts). Packaging the independently parsed data as an aggregate does not
establish a blanket license for unrelated components. Any broader derivative
integration/distribution needs to satisfy applicable GPL obligations as well.

Licensing scope relies on distribution of this explicitly advertised database
within the GPL repository, not on filesystem possession or a claim that all
Habbo assets are freely licensed. Unknown custom models are excluded.
