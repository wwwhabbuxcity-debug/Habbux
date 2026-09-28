package com.habbux.user;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Objects;
import java.util.Optional;
import javax.sql.DataSource;

/** Parameterized SQL boundary for real Auth/User Core operations. */
public final class UserRepository {
    private static final int QUERY_TIMEOUT_SECONDS = 5;
    private static final String FIND_BY_USERNAME = """
            SELECT u.id, u.username, u.status, c.password_hash
              FROM users u JOIN user_credentials c ON c.user_id = u.id
             WHERE u.username_normalized = ?
            """;
    private static final String FIND_BY_EMAIL = """
            SELECT u.id, u.username, u.status, c.password_hash
              FROM users u JOIN user_credentials c ON c.user_id = u.id
             WHERE u.email_normalized = ?
            """;

    private final DataSource dataSource;

    public UserRepository(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    public Optional<StoredCredentials> findForAuthentication(LoginIdentifier login) {
        Objects.requireNonNull(login, "login");
        String sql = login.kind() == LoginIdentifier.Kind.EMAIL ? FIND_BY_EMAIL : FIND_BY_USERNAME;
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setString(1, login.normalizedValue());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return Optional.empty();
                return Optional.of(new StoredCredentials(
                        new UserIdentity(result.getLong("id"), result.getString("username")),
                        AccountStatus.valueOf(result.getString("status")),
                        result.getString("password_hash")));
            }
        } catch (SQLException exception) {
            throw new UserDataAccessException("Unable to read authentication record", exception);
        }
    }

    /** Hashing is completed by the caller before entering this short transaction. */
    public UserIdentity create(ValidatedUser user, String passwordHash) {
        Objects.requireNonNull(user, "user");
        Objects.requireNonNull(passwordHash, "passwordHash");
        if (!passwordHash.startsWith("$argon2id$") || passwordHash.length() > 255) {
            throw new IllegalArgumentException("passwordHash must be an Argon2id PHC string");
        }
        String insertUser = """
                INSERT INTO users (username, username_normalized, email, email_normalized)
                VALUES (?, ?, ?, ?)
                RETURNING id
                """;
        String insertCredentials = """
                INSERT INTO user_credentials (user_id, password_hash)
                VALUES (?, ?)
                """;
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                long id;
                try (PreparedStatement statement = connection.prepareStatement(insertUser)) {
                    statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
                    statement.setString(1, user.username());
                    statement.setString(2, user.usernameNormalized());
                    statement.setString(3, user.email());
                    statement.setString(4, user.emailNormalized());
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) throw new SQLException("User insert returned no identity");
                        id = result.getLong(1);
                    }
                }
                try (PreparedStatement statement = connection.prepareStatement(insertCredentials)) {
                    statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
                    statement.setLong(1, id);
                    statement.setString(2, passwordHash);
                    statement.executeUpdate();
                }
                connection.commit();
                return new UserIdentity(id, user.username());
            } catch (SQLException | RuntimeException exception) {
                rollback(connection, exception);
                if (exception instanceof SQLException sql && "23505".equals(sql.getSQLState())) {
                    throw new DuplicateUserException();
                }
                if (exception instanceof SQLException sql) {
                    throw new UserDataAccessException("Unable to create user", sql);
                }
                throw exception;
            }
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) throw new DuplicateUserException();
            throw new UserDataAccessException("Unable to create user", exception);
        }
    }

    private static void rollback(Connection connection, Exception failure) {
        try {
            connection.rollback();
        } catch (SQLException rollbackFailure) {
            failure.addSuppressed(rollbackFailure);
        }
    }

    public static final class UserDataAccessException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private UserDataAccessException(String message, SQLException cause) { super(message, cause); }
    }
}
