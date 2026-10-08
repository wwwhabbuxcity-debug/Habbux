package com.habbux.theme;

/** Product defaults are code-owned so a damaged configuration can always be restored safely. */
public final class LoginThemeDefaults {
    private LoginThemeDefaults() { }

    public static LoginThemeConfiguration configuration(LoginThemeId theme) {
        return switch (theme) {
            case NEON_PURPLE -> config(theme, "#A855F7", "#EC4899", "#B237F5");
            case TROPICAL_BLUE -> config(theme, "#11C5E8", "#18A7D8", "#17B8EE");
            case SUNSET_PINK -> config(theme, "#F53F9A", "#F9735B", "#EF3A91");
            case COSMIC_BLUE -> config(theme, "#31B9FF", "#366AF7", "#36AFFF");
            case EMERALD_GARDEN -> config(theme, "#21C58A", "#B6D55B", "#18A879");
            case DESERT_BAZAAR -> config(theme, "#F6A84C", "#D45B31", "#E8863E");
            case ARCTIC_LODGE -> config(theme, "#86D4F7", "#5A82D8", "#6FADE9");
            case UNDERWATER_CORAL -> config(theme, "#35D6D0", "#F579A8", "#2CBCC8");
            case ARCADE_DISTRICT -> config(theme, "#FF4FAA", "#8657FF", "#D04DFF");
            case HALLOWEEN_NIGHT -> config(theme, "#F78B2E", "#8D3CCB", "#E56522", "Uma noite de histórias, encontros e diversão no Habbux.");
            case EASTER_SPRING -> config(theme, "#F49CD7", "#A17DEB", "#E984C8", "Uma temporada cheia de cores, quartos e novas histórias.");
            case CHRISTMAS_VILLAGE -> config(theme, "#D95357", "#30A77C", "#C83E51", "Celebre encontros e novas histórias no Habbux.");
            case CARNIVAL_NIGHT -> config(theme, "#F9C24D", "#FF4F8C", "#E93C93", "A festa começa com quartos, amizades e muita cor.");
            case NEW_YEAR_ROOFTOP -> config(theme, "#D9B968", "#5867E8", "#C9A954", "Um novo capítulo começa com a comunidade Habbux.");
        };
    }

    private static LoginThemeConfiguration config(LoginThemeId theme, String primary, String secondary, String button) {
        return config(theme, primary, secondary, button, "Crie quartos, faça amizades e viva novas histórias no Habbux.");
    }

    private static LoginThemeConfiguration config(LoginThemeId theme, String primary, String secondary, String button,
                                                   String description) {
        String eyebrow = switch (theme) {
            case HALLOWEEN_NIGHT, EASTER_SPRING, CHRISTMAS_VILLAGE, CARNIVAL_NIGHT, NEW_YEAR_ROOFTOP -> "UMA TEMPORADA ESPECIAL CHEGOU";
            default -> "UM NOVO MUNDO ESTÁ NASCENDO";
        };
        return new LoginThemeConfiguration(theme, "HABBUX", eyebrow,
                "Entre, explore e faça parte.", description,
                "Descubra o Habbux", true, "", "", primary, secondary, button,
                68, 14, 76, 72, 16, true, "default", 1);
    }
}
