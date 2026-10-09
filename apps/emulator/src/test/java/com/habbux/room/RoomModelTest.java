package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RoomModelTest {
    @Test
    void loadsAllApprovedValidModelsAndPreservesInvalidModelExclusion() {
        RoomModelRegistry registry = RoomModelRegistry.loadDefault();
        assertEquals(127, registry.models().size());
        assertTrue(registry.find("hbx_gx_model_s_v5").isPresent());
        assertTrue(registry.find("hbx_gx_custom_9_v5").isPresent());
        assertTrue(registry.find("hbx_gx_custom_10_v5").isPresent());
        assertTrue(registry.find("hbx_gx_custom_13_v5").isPresent());
        assertTrue(registry.find("hbx_terrace_v3").isPresent());
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
    @Test
    void diagonalsCannotCutBlockedCornersOrSkipTiles() {
        RoomGridDefinition oneBlocked = new RoomGridDefinition(2, 2, new byte[]{1, 0, 1, 1}, 0, 0);
        assertFalse(oneBlocked.canTraverse(0, 0, 1, 1));
        RoomGridDefinition open = new RoomGridDefinition(3, 3, new byte[]{1,1,1,1,1,1,1,1,1}, 0, 0);
        assertTrue(open.canTraverse(0, 0, 1, 1));
        assertFalse(open.canTraverse(0, 0, 2, 2));
        assertFalse(open.canTraverse(0, 0, 0, 0));
    }

    @Test
    void diagonalCannotCutAHighCornerEvenWhenDestinationIsFlat() {
        RoomGridDefinition grid = new RoomGridDefinition(2, 2, new byte[]{1,1,1,1},
                new byte[]{0,2,0,0}, 0, 0, "test", 0, 0, 2);
        assertFalse(grid.canTraverse(0, 0, 1, 1));
    }

    @Test
    void strictOriginalBoundaryRejectsDisconnectedAndRemoteSpawnModels() {
        RoomModelDefinition islands = new RoomModelDefinition("hbx_test", 3, 1,
                new byte[]{0, -1, 0}, 0, 0, 2);
        assertThrows(IllegalArgumentException.class, () -> RoomModelValidator.validateConnected(islands));
        RoomModelDefinition remote = new RoomModelDefinition("hbx_remote", 3, 3,
                new byte[]{-1,-1,-1,-1,-1,-1,-1,-1,0}, 0, 0, 2);
        assertThrows(IllegalArgumentException.class, () -> RoomModelValidator.validateConnected(remote));
        RoomModelDefinition stairs = new RoomModelDefinition("hbx_stairs", 2, 2,
                new byte[]{0,1,1,2}, 0, 0, 2);
        RoomModelValidator.validateConnected(stairs);
    }

}
