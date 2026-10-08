package com.habbux.theme;

/** Persistence boundary for login presentation choices. */
public interface LoginThemeStore {
    LoginThemesSnapshot load();

    LoginThemesSnapshot activate(LoginThemeId theme, String changedBy);

    LoginThemeConfiguration save(LoginThemeConfiguration configuration, String changedBy, String action);
}
