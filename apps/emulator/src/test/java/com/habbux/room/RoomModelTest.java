package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RoomModelTest {
    @Test
    void loadsAllApprovedValidModelsAndPreservesInvalidModelExclusion() {
        RoomModelRegistry registry = RoomModelRegistry.loadDefault();
        assertEquals(63, registry.models().size());
        assertTrue(registry.find("model_s").isPresent());
        assertFalse(registry.find("the_den").isPresent());
        assertEquals("model_s", registry.findVirtual(new RoomId(registry.virtualRoomId("model_s"))).orElseThrow().id());
    }

    @Test
    void convertsHeightmapToCompactGridAndResolvesVoidDoor() {
        RoomModelRegistry registry = RoomModelRegistry.loadDefault();
        RoomModelDefinition model = registry.find("model_oscar").orElseThrow();
        RoomGridDefinition grid = model.toGrid();
        assertEquals(64, grid.width());
        assertEquals(-1, grid.elevationAt(model.doorX(), model.doorY()));
        assertTrue(grid.isWalkable(model.spawnX(), model.spawnY()));
        assertTrue(grid.canTraverse(model.spawnX(), model.spawnY(), model.spawnX() + 1, model.spawnY())
                || grid.canTraverse(model.spawnX(), model.spawnY(), model.spawnX() - 1, model.spawnY())
                || grid.canTraverse(model.spawnX(), model.spawnY(), model.spawnX(), model.spawnY() + 1)
                || grid.canTraverse(model.spawnX(), model.spawnY(), model.spawnX(), model.spawnY() - 1));
    }

    @Test
    void blocksMovementAcrossMoreThanOneElevationWithoutRampSupport() {
        byte[] walkable = {1, 1};
        byte[] elevations = {0, 2};
        RoomGridDefinition grid = new RoomGridDefinition(2, 1, walkable, elevations, 0, 0,
                "test", 0, 0, 1);
        assertFalse(grid.canTraverse(0, 0, 1, 0));
    }
}
