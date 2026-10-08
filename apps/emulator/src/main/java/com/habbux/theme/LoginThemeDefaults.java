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
        };
    }

    private static LoginThemeConfiguration config(LoginThemeId theme, String primary, String secondary, String button) {
        return new LoginThemeConfiguration(theme, "HABBUX", "UM NOVO MUNDO ESTÁ NASCENDO",
                "Entre, explore e faça parte.", "Crie quartos, faça amizades e viva novas histórias no Habbux.",
                "Descubra o Habbux", true, "", "", primary, secondary, button,
                68, 14, 76, 72, 16, true, "default", 1);
    }
}
