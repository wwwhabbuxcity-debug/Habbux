package com.habbux.persistence;

import com.habbux.admin.HotelSettings;
import com.habbux.admin.HotelSettingsStore;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Objects;
import javax.sql.DataSource;

/** Parameterized persistence for the single owner-managed hotel settings row. */
public final class HotelSettingsRepository implements HotelSettingsStore {
    private static final int QUERY_TIMEOUT_SECONDS = 3;
    private static final String LOAD = "SELECT hotel_name, motd, registrations_enabled, maintenance_enabled "
            + "FROM hotel_settings WHERE id = 1";
    private static final String SAVE = "UPDATE hotel_settings SET hotel_name = ?, motd = ?, "
            + "registrations_enabled = ?, maintenance_enabled = ?, updated_at = transaction_timestamp() "
            + "WHERE id = 1 RETURNING hotel_name, motd, registrations_enabled, maintenance_enabled";
    private final DataSource dataSource;

    public HotelSettingsRepository(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    @Override
    public HotelSettings load() {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(LOAD)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new HotelSettingsDataAccessException("hotel settings row is missing", null);
                return map(result);
            }
        } catch (SQLException exception) {
            throw new HotelSettingsDataAccessException("unable to load hotel settings", exception);
        }
    }

    @Override
    public HotelSettings save(HotelSettings settings) {
        Objects.requireNonNull(settings, "settings");
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(SAVE)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setString(1, settings.hotelName());
            statement.setString(2, settings.motd());
            statement.setBoolean(3, settings.registrationsEnabled());
            statement.setBoolean(4, settings.maintenanceEnabled());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new HotelSettingsDataAccessException("hotel settings row is missing", null);
                return map(result);
            }
        } catch (SQLException exception) {
            throw new HotelSettingsDataAccessException("unable to save hotel settings", exception);
        }
    }

    private static HotelSettings map(ResultSet result) throws SQLException {
        return new HotelSettings(result.getString("hotel_name"), result.getString("motd"),
                result.getBoolean("registrations_enabled"), result.getBoolean("maintenance_enabled"));
    }

    public static final class HotelSettingsDataAccessException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public HotelSettingsDataAccessException(String message, Throwable cause) { super(message, cause); }
    }
}
