package com.habbux.user;

import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

/** User fields after canonicalization; passwords remain outside this type. */
public record ValidatedUser(String username, String usernameNormalized, String email, String emailNormalized) {
    private static final Pattern USERNAME = Pattern.compile("[A-Za-z][A-Za-z0-9_]{2,19}");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9_%+.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}");

    public ValidatedUser {
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(usernameNormalized, "usernameNormalized");
        Objects.requireNonNull(email, "email");
        Objects.requireNonNull(emailNormalized, "emailNormalized");
        if (!USERNAME.matcher(username).matches() || !usernameNormalized.equals(username.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("username is invalid");
        }
        if (!isEmailValid(email)
                || !emailNormalized.equals(email.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("email is invalid");
        }
    }

    public static ValidatedUser create(String username, String email) {
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(email, "email");
        String cleanUsername = username;
        String cleanEmail = email.strip();
        return new ValidatedUser(cleanUsername, cleanUsername.toLowerCase(Locale.ROOT),
                cleanEmail, cleanEmail.toLowerCase(Locale.ROOT));
    }

    public static String normalizeLogin(String login) {
        Objects.requireNonNull(login, "login");
        String value = login.strip();
        if (value.contains("@")) {
            if (!isEmailValid(value)) {
                throw new IllegalArgumentException("login is invalid");
            }
            return value.toLowerCase(Locale.ROOT);
        }
        if (!USERNAME.matcher(value).matches()) throw new IllegalArgumentException("login is invalid");
        return value.toLowerCase(Locale.ROOT);
    }

    private static boolean isEmailValid(String email) {
        if (email.length() > 254 || !EMAIL.matcher(email).matches() || email.contains("..")) return false;
        int separator = email.indexOf('@');
        if (separator < 1 || separator > 64 || email.lastIndexOf('@') != separator) return false;
        String local = email.substring(0, separator);
        if (local.startsWith(".") || local.endsWith(".")) return false;
        for (String label : email.substring(separator + 1).split("\\.")) {
            if (label.isEmpty() || label.length() > 63 || label.startsWith("-") || label.endsWith("-")) return false;
        }
        return true;
    }

}
