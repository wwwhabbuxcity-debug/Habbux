package com.habbux.theme;

import java.util.List;
import java.util.Locale;

/** Stable identifiers shared by persistence, the owner panel and the public login page. */
public enum LoginThemeId {
    NEON_PURPLE("neon-purple", "Neon Purple", "Mundo flutuante noturno em violeta."),
    TROPICAL_BLUE("tropical-blue", "Tropical Blue", "Ilha ensolarada, mar e farol."),
    SUNSET_PINK("sunset-pink", "Sunset Pink", "Terraço acolhedor ao pôr do sol."),
    COSMIC_BLUE("cosmic-blue", "Cosmic Blue", "Universos sociais conectados no espaço."),
    EMERALD_GARDEN("emerald-garden", "Jardim Esmeralda", "Estufa flutuante entre plantas e luzes."),
    DESERT_BAZAAR("desert-bazaar", "Bazar do Deserto", "Pátio acolhedor sob o pôr do sol."),
    ARCTIC_LODGE("arctic-lodge", "Refúgio Ártico", "Chalé nevado sob a aurora boreal."),
    UNDERWATER_CORAL("underwater-coral", "Recife Coral", "Hotel submerso em um recife luminoso."),
    ARCADE_DISTRICT("arcade-district", "Distrito Arcade", "Rooftop neon em uma noite de jogos."),
    HALLOWEEN_NIGHT("halloween-night", "Noite de Halloween", "Mansão iluminada em uma noite de outubro."),
    EASTER_SPRING("easter-spring", "Páscoa em Flor", "Jardim de primavera cheio de cores."),
    CHRISTMAS_VILLAGE("christmas-village", "Vila de Natal", "Vila nevada com luzes e encontros."),
    CARNIVAL_NIGHT("carnival-night", "Noite de Carnaval", "Festa tropical cheia de música e cor."),
    NEW_YEAR_ROOFTOP("new-year-rooftop", "Réveillon no Terraço", "Uma virada especial sobre a cidade.");

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
