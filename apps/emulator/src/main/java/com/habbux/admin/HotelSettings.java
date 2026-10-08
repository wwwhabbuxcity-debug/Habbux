package com.habbux.admin;

import java.util.Objects;

/** Validated, persisted controls exposed by the owner-only hotel panel. */
public record HotelSettings(String hotelName, String motd, boolean registrationsEnabled, boolean maintenanceEnabled) {
    public static final int MAX_HOTEL_NAME_CODE_POINTS = 80;
    public static final int MAX_MOTD_CODE_POINTS = 300;

    public HotelSettings {
        hotelName = requiredText(hotelName, MAX_HOTEL_NAME_CODE_POINTS, "hotel name");
        motd = optionalText(motd, MAX_MOTD_CODE_POINTS, "motd");
    }

    public static HotelSettings defaults() {
        return new HotelSettings("Habbux", "Bem-vinda ao Habbux.", true, false);
    }

    private static String requiredText(String value, int maximumCodePoints, String field) {
        String normalized = optionalText(value, maximumCodePoints, field);
        if (normalized.isEmpty()) throw new IllegalArgumentException(field + " must not be blank");
        return normalized;
    }

    private static String optionalText(String value, int maximumCodePoints, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.codePointCount(0, normalized.length()) > maximumCodePoints) {
            throw new IllegalArgumentException(field + " exceeds its maximum length");
        }
        if (normalized.codePoints().anyMatch(HotelSettings::isUnsupportedControl)) {
            throw new IllegalArgumentException(field + " contains an unsupported control character");
        }
        return normalized;
    }

    private static boolean isUnsupportedControl(int codePoint) {
        return Character.isISOControl(codePoint) && codePoint != '\n' && codePoint != '\t';
    }
}
