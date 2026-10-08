package com.habbux.theme;

import java.util.Map;
import java.util.Objects;

/** Immutable in-memory read model used by the HTTP adapter. */
public record LoginThemesSnapshot(LoginThemeId activeTheme, int activeVersion,
                                  Map<LoginThemeId, LoginThemeConfiguration> configurations) {
    public LoginThemesSnapshot {
        activeTheme = Objects.requireNonNull(activeTheme, "activeTheme");
        if (activeVersion < 1) throw new IllegalArgumentException("invalid active version");
        configurations = Map.copyOf(Objects.requireNonNull(configurations, "configurations"));
        if (!configurations.keySet().containsAll(LoginThemeId.all())) {
            throw new IllegalArgumentException("a configuration is required for every login theme");
        }
    }

    public LoginThemeConfiguration activeConfiguration() { return configuration(activeTheme); }

    public LoginThemeConfiguration configuration(LoginThemeId theme) {
        LoginThemeConfiguration configuration = configurations.get(Objects.requireNonNull(theme, "theme"));
        if (configuration == null) throw new IllegalArgumentException("missing login theme configuration");
        return configuration;
    }

    public static LoginThemesSnapshot defaults() {
        java.util.EnumMap<LoginThemeId, LoginThemeConfiguration> configurations = new java.util.EnumMap<>(LoginThemeId.class);
        for (LoginThemeId theme : LoginThemeId.all()) configurations.put(theme, LoginThemeDefaults.configuration(theme));
        return new LoginThemesSnapshot(LoginThemeId.NEON_PURPLE, 1, configurations);
    }
}
