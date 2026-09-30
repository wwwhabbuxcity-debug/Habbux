package com.habbux.room;

import java.time.Instant;
import java.util.Optional;

/** Composes persisted rooms with approved, read-only DEV model rooms. */
public final class RoomModelRuntime implements RoomLoader {
    private final RoomLoader persisted;
    private final RoomModelRegistry registry;

    public RoomModelRuntime(RoomLoader persisted, RoomModelRegistry registry) {
        this.persisted = java.util.Objects.requireNonNull(persisted, "persisted");
        this.registry = java.util.Objects.requireNonNull(registry, "registry");
    }

    @Override public Optional<RoomMetadata> findById(RoomId id) {
        Optional<RoomMetadata> stored = persisted.findById(id);
        if (stored.isPresent()) return stored;
        return registry.findVirtual(id).map(model -> {
            Instant now = Instant.now();
            return new RoomMetadata(id, 1, "Habbux · " + model.id(),
                    "Modelo estrutural aprovado para validação DEV.", 50, model.toGrid(), now, now);
        });
    }
}
