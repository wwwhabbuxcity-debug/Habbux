package com.habbux.theme;

import java.util.List;
import java.util.Locale;

/** Stable identifiers shared by persistence, the owner panel and the public login page. */
public enum LoginThemeId {
    NEON_PURPLE("neon-purple", "Neon Purple", "Mundo flutuante noturno em violeta."),
    TROPICAL_BLUE("tropical-blue", "Tropical Blue", "Ilha ensolarada, mar e farol."),
    SUNSET_PINK("sunset-pink", "Sunset Pink", "Terraço acolhedor ao pôr do sol."),
    COSMIC_BLUE("cosmic-blue", "Cosmic Blue", "Universos sociais conectados no espaço.");

    private final String value;
    private final String displayName;
    private final String description;

    LoginThemeId(String value, String displayName, String description) {
        this.value = value;
        this.displayName = displayName;
        this.description = description;
    }

    public String value() { return value; }

    public String displayName() { return displayName; }

    public String description() { return description; }

    public static LoginThemeId parse(String value) {
        if (value == null) throw new IllegalArgumentException("theme id is required");
        String normalized = value.strip().toLowerCase(Locale.ROOT);
        for (LoginThemeId candidate : values()) {
            if (candidate.value.equals(normalized)) return candidate;
        }
        throw new IllegalArgumentException("unknown login theme");
    }

    public static List<LoginThemeId> all() { return List.of(values()); }
}
