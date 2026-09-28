package com.habbux.user;

import java.util.Objects;

/** Canonical login selector, with the lookup column chosen without SQL concatenation. */
public record LoginIdentifier(String normalizedValue, Kind kind) {
    public enum Kind { USERNAME, EMAIL }

    public LoginIdentifier {
        Objects.requireNonNull(normalizedValue, "normalizedValue");
        Objects.requireNonNull(kind, "kind");
    }

    public static LoginIdentifier from(String login) {
        String normalized = ValidatedUser.normalizeLogin(login);
        return new LoginIdentifier(normalized,
                normalized.indexOf('@') >= 0 ? Kind.EMAIL : Kind.USERNAME);
    }
}
