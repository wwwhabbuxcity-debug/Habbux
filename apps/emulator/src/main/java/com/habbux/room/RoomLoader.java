package com.habbux.room;

import java.util.Optional;

@FunctionalInterface
public interface RoomLoader {
    Optional<RoomMetadata> findById(RoomId id);
}
