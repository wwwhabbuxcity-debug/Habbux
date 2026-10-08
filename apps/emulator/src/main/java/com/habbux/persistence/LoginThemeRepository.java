package com.habbux.persistence;

import com.habbux.theme.LoginThemeConfiguration;
import com.habbux.theme.LoginThemeId;
import com.habbux.theme.LoginThemeStore;
import com.habbux.theme.LoginThemesSnapshot;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.EnumMap;
import java.util.Objects;
import javax.sql.DataSource;

/** Parameterized PostgreSQL persistence for the owner-managed login presentation. */
public final class LoginThemeRepository implements LoginThemeStore {
    private static final int QUERY_TIMEOUT_SECONDS = 3;
    private static final String LOAD_STATE = "SELECT active_theme, version FROM login_theme_state WHERE id = 1";
    private static final String LOAD_CONFIGS = "SELECT theme_id, logo_text, eyebrow, title, description, cta_text, "
            + "cta_visible, institutional_text, institutional_url, primary_color, secondary_color, button_color, "
            + "glass_opacity, blur_pixels, card_opacity, glow_intensity, border_radius, decorations_enabled, hero_asset, "
            + "version FROM login_theme_config ORDER BY theme_id";
    private static final String ACTIVATE = "UPDATE login_theme_state SET active_theme = ?, version = version + 1, "
            + "updated_at = transaction_timestamp(), updated_by = ? WHERE id = 1 RETURNING active_theme, version";
    private static final String SAVE = "UPDATE login_theme_config SET logo_text = ?, eyebrow = ?, title = ?, description = ?, "
            + "cta_text = ?, cta_visible = ?, institutional_text = ?, institutional_url = ?, primary_color = ?, "
            + "secondary_color = ?, button_color = ?, glass_opacity = ?, blur_pixels = ?, card_opacity = ?, "
            + "glow_intensity = ?, border_radius = ?, decorations_enabled = ?, hero_asset = ?, version = version + 1, "
            + "updated_at = transaction_timestamp(), updated_by = ? WHERE theme_id = ? RETURNING theme_id, logo_text, eyebrow, "
            + "title, description, cta_text, cta_visible, institutional_text, institutional_url, primary_color, secondary_color, "
            + "button_color, glass_opacity, blur_pixels, card_opacity, glow_intensity, border_radius, decorations_enabled, "
            + "hero_asset, version";
    private static final String HISTORY = "INSERT INTO login_theme_history (theme_id, action, configuration_version, changed_by) "
            + "VALUES (?, ?, ?, ?)";
    private final DataSource dataSource;

    public LoginThemeRepository(DataSource dataSource) { this.dataSource = Objects.requireNonNull(dataSource, "dataSource"); }

    @Override
    public LoginThemesSnapshot load() {
        try (Connection connection = dataSource.getConnection()) {
            return load(connection);
        } catch (SQLException exception) {
            throw new LoginThemeDataAccessException("unable to load login themes", exception);
        }
    }

    @Override
    public LoginThemesSnapshot activate(LoginThemeId theme, String changedBy) {
        Objects.requireNonNull(theme, "theme");
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                int activeVersion;
                try (PreparedStatement statement = connection.prepareStatement(ACTIVATE)) {
                    statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
                    statement.setString(1, theme.value());
                    statement.setString(2, changedBy);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) throw new LoginThemeDataAccessException("login theme state row is missing", null);
                        activeVersion = result.getInt("version");
                    }
                }
                history(connection, theme, "activated", activeVersion, changedBy);
                LoginThemesSnapshot snapshot = load(connection);
                connection.commit();
                return snapshot;
            } catch (SQLException | RuntimeException failure) {
                rollback(connection, failure);
                throw failure;
            }
        } catch (SQLException exception) {
            throw new LoginThemeDataAccessException("unable to activate login theme", exception);
        }
    }

    @Override
    public LoginThemeConfiguration save(LoginThemeConfiguration configuration, String changedBy, String action) {
        Objects.requireNonNull(configuration, "configuration");
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                LoginThemeConfiguration saved;
                try (PreparedStatement statement = connection.prepareStatement(SAVE)) {
                    statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
                    bindSave(statement, configuration, changedBy);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) throw new LoginThemeDataAccessException("login theme row is missing", null);
                        saved = map(result);
                    }
                }
                history(connection, configuration.theme(), action, saved.version(), changedBy);
                connection.commit();
                return saved;
            } catch (SQLException | RuntimeException failure) {
                rollback(connection, failure);
                throw failure;
            }
        } catch (SQLException exception) {
            throw new LoginThemeDataAccessException("unable to save login theme", exception);
        }
    }

    private static LoginThemesSnapshot load(Connection connection) throws SQLException {
        LoginThemeId activeTheme;
        int activeVersion;
        try (PreparedStatement statement = connection.prepareStatement(LOAD_STATE)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new LoginThemeDataAccessException("login theme state row is missing", null);
                activeTheme = LoginThemeId.parse(result.getString("active_theme"));
                activeVersion = result.getInt("version");
            }
        }
        EnumMap<LoginThemeId, LoginThemeConfiguration> configurations = new EnumMap<>(LoginThemeId.class);
        try (PreparedStatement statement = connection.prepareStatement(LOAD_CONFIGS)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    LoginThemeConfiguration configuration = map(result);
                    configurations.put(configuration.theme(), configuration);
                }
            }
        }
        return new LoginThemesSnapshot(activeTheme, activeVersion, configurations);
    }

    private static void bindSave(PreparedStatement statement, LoginThemeConfiguration value, String changedBy)
            throws SQLException {
        statement.setString(1, value.logoText());
        statement.setString(2, value.eyebrow());
        statement.setString(3, value.title());
        statement.setString(4, value.description());
        statement.setString(5, value.ctaText());
        statement.setBoolean(6, value.ctaVisible());
        statement.setString(7, value.institutionalText());
        statement.setString(8, value.institutionalUrl());
        statement.setString(9, value.primaryColor());
        statement.setString(10, value.secondaryColor());
        statement.setString(11, value.buttonColor());
        statement.setInt(12, value.glassOpacity());
        statement.setInt(13, value.blurPixels());
        statement.setInt(14, value.cardOpacity());
        statement.setInt(15, value.glowIntensity());
        statement.setInt(16, value.borderRadius());
        statement.setBoolean(17, value.decorationsEnabled());
        statement.setString(18, value.heroAsset());
        statement.setString(19, changedBy);
        statement.setString(20, value.theme().value());
    }

    private static void history(Connection connection, LoginThemeId theme, String action, int version, String changedBy)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(HISTORY)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setString(1, theme.value());
            statement.setString(2, action);
            statement.setInt(3, version);
            statement.setString(4, changedBy);
            statement.executeUpdate();
        }
    }

    private static LoginThemeConfiguration map(ResultSet result) throws SQLException {
        return new LoginThemeConfiguration(LoginThemeId.parse(result.getString("theme_id")), result.getString("logo_text"),
                result.getString("eyebrow"), result.getString("title"), result.getString("description"),
                result.getString("cta_text"), result.getBoolean("cta_visible"), result.getString("institutional_text"),
                result.getString("institutional_url"), result.getString("primary_color"), result.getString("secondary_color"),
                result.getString("button_color"), result.getInt("glass_opacity"), result.getInt("blur_pixels"),
                result.getInt("card_opacity"), result.getInt("glow_intensity"), result.getInt("border_radius"),
                result.getBoolean("decorations_enabled"), result.getString("hero_asset"), result.getInt("version"));
    }

    private static void rollback(Connection connection, Exception original) {
        try { connection.rollback(); }
        catch (SQLException rollbackFailure) { original.addSuppressed(rollbackFailure); }
    }

    public static final class LoginThemeDataAccessException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        LoginThemeDataAccessException(String message, Throwable cause) { super(message, cause); }
    }
}
