package com.habbux.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import java.util.Objects;
import javax.sql.DataSource;

/** Small PostgreSQL pool; unavailable databases do not prevent the network process from starting. */
public final class DatabasePool implements AutoCloseable {
    private final HikariDataSource dataSource;

    public DatabasePool(DatabaseConfig config) {
        Objects.requireNonNull(config, "config");
        HikariConfig hikari = new HikariConfig();
        hikari.setPoolName("habbux-postgres");
        hikari.setJdbcUrl(config.jdbcUrl());
        hikari.setUsername(config.username());
        hikari.setPassword(config.password());
        hikari.setMinimumIdle(config.minimumPoolSize());
        hikari.setMaximumPoolSize(config.maximumPoolSize());
        hikari.setConnectionTimeout(config.connectionTimeoutMillis());
        hikari.setValidationTimeout(Math.min(1_000, config.connectionTimeoutMillis() - 1));
        hikari.setIdleTimeout(config.idleTimeoutMillis());
        hikari.setMaxLifetime(config.maxLifetimeMillis());
        hikari.setInitializationFailTimeout(-1);
        hikari.setConnectionInitSql("SET TIME ZONE 'UTC'");
        this.dataSource = new HikariDataSource(hikari);
    }

    public DataSource dataSource() { return dataSource; }

    public PoolSnapshot snapshot() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        if (pool == null) return new PoolSnapshot(0, 0, 0);
        return new PoolSnapshot(pool.getActiveConnections(), pool.getIdleConnections(), pool.getThreadsAwaitingConnection());
    }

    @Override
    public void close() { dataSource.close(); }

    public record PoolSnapshot(int active, int idle, int pending) { }
}
