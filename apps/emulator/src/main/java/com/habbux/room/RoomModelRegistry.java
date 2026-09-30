package com.habbux.room;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Immutable lookup table for approved models and their DEV-only virtual room IDs. */
public final class RoomModelRegistry {
    public static final long VIRTUAL_ROOM_BASE = 9_000_000_000_000_000_000L;
    private final List<RoomModelDefinition> models;
    private final Map<String, RoomModelDefinition> byId;

    public RoomModelRegistry(List<RoomModelDefinition> models) {
        if (models == null || models.isEmpty()) throw new IllegalArgumentException("room model registry cannot be empty");
        Map<String, RoomModelDefinition> indexed = new LinkedHashMap<>();
        for (RoomModelDefinition model : models) {
            if (indexed.put(model.id(), model) != null) throw new IllegalArgumentException("duplicate room model id");
        }
        this.models = List.copyOf(models);
        this.byId = Map.copyOf(indexed);
    }

    public static RoomModelRegistry loadDefault() { return new RoomModelRegistry(RoomModelLoader.loadDefault()); }
    public List<RoomModelDefinition> models() { return models; }
    public Optional<RoomModelDefinition> find(String id) { return Optional.ofNullable(byId.get(id)); }
    public Optional<RoomModelDefinition> findVirtual(RoomId roomId) {
        long offset = roomId.value() - VIRTUAL_ROOM_BASE;
        if (offset < 1 || offset > models.size()) return Optional.empty();
        return Optional.of(models.get((int) offset - 1));
    }
    public long virtualRoomId(String modelId) {
        for (int index = 0; index < models.size(); index++) if (models.get(index).id().equals(modelId)) return VIRTUAL_ROOM_BASE + index + 1;
        throw new IllegalArgumentException("unknown room model: " + modelId);
    }
}
