package com.habbux.theme;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.util.EnumMap;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class LoginThemeServiceTest {
    @Test
    void persistsAnUpdateBeforePublishingTheThemeSnapshot() throws Exception {
        MemoryStore store = new MemoryStore();
        try (LoginThemeService service = new LoginThemeService(store, Files.createTempDirectory("habbux-theme-test"))) {
            LoginThemeConfiguration initial = service.current().configuration(LoginThemeId.TROPICAL_BLUE);
            LoginThemeConfiguration requested = new LoginThemeConfiguration(LoginThemeId.TROPICAL_BLUE, "HABBUX BR",
                    initial.eyebrow(), "Uma ilha para todos", initial.description(), initial.ctaText(), true,
                    "", "", "#11C5E8", "#18A7D8", "#17B8EE", 70, 12, 78, 65, 18, false,
                    initial.heroAsset(), initial.version());

            LoginThemeConfiguration saved = service.update(requested).get(1, TimeUnit.SECONDS);

            assertEquals("HABBUX BR", saved.logoText());
            assertEquals(saved, store.snapshot.configuration(LoginThemeId.TROPICAL_BLUE));
            assertEquals(saved, service.current().configuration(LoginThemeId.TROPICAL_BLUE));
            assertFalse(saved.decorationsEnabled());
        }
    }

    @Test
    void atomicallyPublishesOnlyTheSelectedActiveTheme() throws Exception {
        MemoryStore store = new MemoryStore();
        try (LoginThemeService service = new LoginThemeService(store, Files.createTempDirectory("habbux-theme-test"))) {
            LoginThemesSnapshot saved = service.activate(LoginThemeId.COSMIC_BLUE).get(1, TimeUnit.SECONDS);

            assertEquals(LoginThemeId.COSMIC_BLUE, saved.activeTheme());
            assertEquals(saved, service.current());
            assertTrue(saved.activeVersion() > 1);
        }
    }

    private static final class MemoryStore implements LoginThemeStore {
        private LoginThemesSnapshot snapshot = LoginThemesSnapshot.defaults();

        @Override
        public LoginThemesSnapshot load() { return snapshot; }

        @Override
        public LoginThemesSnapshot activate(LoginThemeId theme, String changedBy) {
            snapshot = new LoginThemesSnapshot(theme, snapshot.activeVersion() + 1, snapshot.configurations());
            return snapshot;
        }

        @Override
        public LoginThemeConfiguration save(LoginThemeConfiguration configuration, String changedBy, String action) {
            LoginThemeConfiguration saved = new LoginThemeConfiguration(configuration.theme(), configuration.logoText(),
                    configuration.eyebrow(), configuration.title(), configuration.description(), configuration.ctaText(),
                    configuration.ctaVisible(), configuration.institutionalText(), configuration.institutionalUrl(),
                    configuration.primaryColor(), configuration.secondaryColor(), configuration.buttonColor(),
                    configuration.glassOpacity(), configuration.blurPixels(), configuration.cardOpacity(),
                    configuration.glowIntensity(), configuration.borderRadius(), configuration.decorationsEnabled(),
                    configuration.heroAsset(), configuration.version() + 1);
            EnumMap<LoginThemeId, LoginThemeConfiguration> configurations = new EnumMap<>(snapshot.configurations());
            configurations.put(saved.theme(), saved);
            snapshot = new LoginThemesSnapshot(snapshot.activeTheme(), snapshot.activeVersion(), configurations);
            return saved;
        }
    }
}
