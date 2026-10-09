package com.habbux.room;

import static org.junit.jupiter.api.Assertions.*;
import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class RoomMigratedModelPathTest {
    @Test @Timeout(8)
    void ownerDeclaredCustomRetainsIsolatedDoorAndRejectsUnreachableMainArea() throws Exception {
        RoomModelDefinition model = RoomModelRegistry.loadDefault().find("hbx_gx_custom_10_v5").orElseThrow();
        assertEquals(21, model.spawnX());
        assertEquals(3, model.spawnY());
        assertTrue(model.isWalkable(4, 1));
        RoomModelValidator.validateLocalSpawn(model);
        assertThrows(IllegalArgumentException.class, () -> RoomModelValidator.validateConnected(model));
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new RoomId(891),1,"Custom 10","",2,model.toGrid(),now,now);
        RoomManager manager = new RoomManager(id -> Optional.of(room),
                new RoomConfig(1,8,64,16,2,10_000,2,8,4096,128,100));
        UUID session = UUID.randomUUID();
        try {
            assertEquals(RoomRuntime.JoinOutcome.JOINED,manager.join(room.id(),session,
                    new UserIdentity(1,"custom_path_test"),message -> {}).result().get(2,TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.UNREACHABLE,
                    manager.move(room.id(),session,4,1,message -> {}).get(1,TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.INVALID_DESTINATION,
                    manager.move(room.id(),session,22,3,message -> {}).get(1,TimeUnit.SECONDS));
        } finally { assertTrue(manager.close(Duration.ofSeconds(3))); }
    }

    @Test @Timeout(8)
    void preservedComponentsRemainIsolatedAndBoundsRejectedByRealPathfinder() throws Exception {
        RoomModelDefinition model = new RoomModelDefinition("hbx_components", 3, 2,
                new byte[]{0,0,3,0,0,3}, 0,0,2);
        RoomModelValidator.validateLocalSpawn(model);
        assertThrows(IllegalArgumentException.class, () -> RoomModelValidator.validateConnected(model));
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new RoomId(890),1,"Components","",2,model.toGrid(),now,now);
        RoomManager manager = new RoomManager(id -> Optional.of(room),
                new RoomConfig(1,8,64,16,2,10_000,2,8,4096,128,100));
        UUID session = UUID.randomUUID();
        try {
            assertEquals(RoomRuntime.JoinOutcome.JOINED,manager.join(room.id(),session,
                    new UserIdentity(1,"path_test"),message -> {}).result().get(2,TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.UNREACHABLE,
                    manager.move(room.id(),session,2,0,message -> {}).get(1,TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.INVALID_DESTINATION,
                    manager.move(room.id(),session,3,0,message -> {}).get(1,TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(),session,1,0,message -> {}).get(1,TimeUnit.SECONDS));
        } finally { assertTrue(manager.close(Duration.ofSeconds(3))); }
    }
}
