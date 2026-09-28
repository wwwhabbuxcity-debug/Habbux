package com.habbux.persistence;

import com.habbux.room.RoomGridDefinition;
import com.habbux.room.RoomId;
import com.habbux.room.RoomMetadata;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Objects;
import java.util.Optional;
import javax.sql.DataSource;

/** Parameterized metadata boundary. The Room Engine calls findById only on its bounded I/O executor. */
public final class RoomRepository {
    private static final int QUERY_TIMEOUT_SECONDS = 5;
    private static final String FIND_BY_ID = """
            SELECT id, owner_user_id, name, description, capacity, grid_width, grid_height,
                   grid_walkability, spawn_x, spawn_y, created_at, updated_at
              FROM rooms WHERE id = ?
            """;
    private final DataSource dataSource;

    public RoomRepository(DataSource dataSource) { this.dataSource = Objects.requireNonNull(dataSource, "dataSource"); }

    public Optional<RoomMetadata> findById(RoomId id) {
        Objects.requireNonNull(id, "id");
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(FIND_BY_ID)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setLong(1, id.value());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return Optional.empty();
                return Optional.of(read(result));
            }
        } catch (SQLException failure) {
            throw new RoomDataAccessException("Unable to read room metadata", failure);
        }
    }

    public RoomMetadata create(long ownerUserId, String name, String description, int capacity,
                               RoomGridDefinition grid) {
        Objects.requireNonNull(grid, "grid");
        if (ownerUserId <= 0) throw new IllegalArgumentException("owner user id must be positive");
        RoomMetadata.requireUtf8(name, 1, 128, "room name");
        RoomMetadata.requireUtf8(description, 0, 512, "room description");
        if (capacity < 1 || capacity > RoomMetadata.MAX_CAPACITY) throw new IllegalArgumentException("capacity is outside the supported range");
        String sql = """
                INSERT INTO rooms (owner_user_id, name, description, capacity, grid_width, grid_height,
                                   grid_walkability, spawn_x, spawn_y)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id, owner_user_id, name, description, capacity, grid_width, grid_height,
                          grid_walkability, spawn_x, spawn_y, created_at, updated_at
                """;
        try (Connection connection = dataSource.getConnection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setLong(1, ownerUserId);
            statement.setString(2, name);
            statement.setString(3, description);
            statement.setInt(4, capacity);
            statement.setInt(5, grid.width());
            statement.setInt(6, grid.height());
            statement.setBytes(7, grid.walkability());
            statement.setInt(8, grid.spawnX());
            statement.setInt(9, grid.spawnY());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new SQLException("room insert returned no row");
                return read(result);
            }
        } catch (SQLException failure) {
            throw new RoomDataAccessException("Unable to create room metadata", failure);
        }
    }

    private static RoomMetadata read(ResultSet result) throws SQLException {
        return new RoomMetadata(new RoomId(result.getLong("id")), result.getLong("owner_user_id"),
                result.getString("name"), result.getString("description"), result.getInt("capacity"),
                new RoomGridDefinition(result.getInt("grid_width"), result.getInt("grid_height"),
                        result.getBytes("grid_walkability"), result.getInt("spawn_x"), result.getInt("spawn_y")),
                result.getTimestamp("created_at").toInstant(), result.getTimestamp("updated_at").toInstant());
    }

    public static final class RoomDataAccessException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public RoomDataAccessException(String message, Throwable cause) { super(message, cause); }
    }
}
