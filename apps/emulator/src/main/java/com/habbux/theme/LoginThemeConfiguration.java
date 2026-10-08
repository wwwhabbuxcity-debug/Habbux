package com.habbux.theme;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Objects;
import java.util.regex.Pattern;

/** Validated public presentation data. It deliberately contains no HTML, CSS or script fields. */
public record LoginThemeConfiguration(
        LoginThemeId theme,
        String logoText,
        String eyebrow,
        String title,
        String description,
        String ctaText,
        boolean ctaVisible,
        String institutionalText,
        String institutionalUrl,
        String primaryColor,
        String secondaryColor,
        String buttonColor,
        int glassOpacity,
        int blurPixels,
        int cardOpacity,
        int glowIntensity,
        int borderRadius,
        boolean decorationsEnabled,
        String heroAsset,
        int version) {
    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Pattern ASSET = Pattern.compile("default|[a-f0-9-]{36}\\.(?:png|jpg)");

    public LoginThemeConfiguration {
        theme = Objects.requireNonNull(theme, "theme");
        logoText = text(logoText, 24, "logo text", true);
        eyebrow = text(eyebrow, 80, "eyebrow", true);
        title = text(title, 120, "title", true);
        description = text(description, 300, "description", true);
        ctaText = text(ctaText, 64, "cta text", true);
        institutionalText = text(institutionalText, 160, "institutional text", false);
        institutionalUrl = url(institutionalUrl);
        primaryColor = color(primaryColor, "primary color");
        secondaryColor = color(secondaryColor, "secondary color");
        buttonColor = color(buttonColor, "button color");
        range(glassOpacity, 20, 96, "glass opacity");
        range(blurPixels, 0, 24, "blur pixels");
        range(cardOpacity, 35, 98, "card opacity");
        range(glowIntensity, 0, 100, "glow intensity");
        range(borderRadius, 6, 32, "border radius");
        if (!ASSET.matcher(Objects.requireNonNull(heroAsset, "hero asset")).matches()) {
            throw new IllegalArgumentException("invalid hero asset");
        }
        range(version, 1, Integer.MAX_VALUE, "version");
    }

    public LoginThemeConfiguration withAsset(String asset, int nextVersion) {
        return new LoginThemeConfiguration(theme, logoText, eyebrow, title, description, ctaText, ctaVisible,
                institutionalText, institutionalUrl, primaryColor, secondaryColor, buttonColor, glassOpacity,
                blurPixels, cardOpacity, glowIntensity, borderRadius, decorationsEnabled, asset, nextVersion);
    }

    private static String text(String value, int maximum, String field, boolean required) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if ((required && normalized.isEmpty()) || normalized.codePointCount(0, normalized.length()) > maximum
                || normalized.codePoints().anyMatch(LoginThemeConfiguration::unsupportedControl)) {
            throw new IllegalArgumentException("invalid " + field);
        }
        return normalized;
    }

    private static String color(String value, String field) {
        if (!COLOR.matcher(Objects.requireNonNull(value, field)).matches()) {
            throw new IllegalArgumentException("invalid " + field);
        }
        return value.toUpperCase(java.util.Locale.ROOT);
    }

    private static String url(String value) {
        String normalized = text(value, 512, "institutional url", false);
        if (normalized.isEmpty()) return normalized;
        try {
            URI parsed = new URI(normalized);
            if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getHost() == null || parsed.getUserInfo() != null) {
                throw new IllegalArgumentException("invalid institutional url");
            }
            return parsed.toASCIIString();
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("invalid institutional url", exception);
        }
    }

    private static void range(int value, int minimum, int maximum, String field) {
        if (value < minimum || value > maximum) throw new IllegalArgumentException("invalid " + field);
    }

    private static boolean unsupportedControl(int codePoint) {
        return Character.isISOControl(codePoint) && codePoint != '\n' && codePoint != '\t';
    }
}
