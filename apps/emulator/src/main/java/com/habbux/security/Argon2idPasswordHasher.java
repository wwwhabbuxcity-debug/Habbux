package com.habbux.security;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

/** Argon2id password hashing with bounded input and bounded parameters from stored hashes. */
public final class Argon2idPasswordHasher {
    public static final int MIN_REGISTRATION_CODE_POINTS = 12;
    public static final int MAX_PASSWORD_CODE_POINTS = 128;
    public static final int MAX_PASSWORD_UTF8_BYTES = 512;
    public static final int MEMORY_KIB = 19_456;
    public static final int ITERATIONS = 2;
    public static final int PARALLELISM = 1;
    private static final int SALT_BYTES = 16;
    private static final int HASH_BYTES = 32;
    private static final Pattern PHC = Pattern.compile(
            "\\$argon2id\\$v=(\\d+)\\$m=(\\d+),t=(\\d+),p=(\\d+)\\$([A-Za-z0-9+/]+)\\$([A-Za-z0-9+/]+)");
    private static final SecureRandom RANDOM = new SecureRandom();

    public String hash(char[] password) {
        byte[] passwordBytes = encodeAndValidate(password);
        byte[] salt = new byte[SALT_BYTES];
        byte[] derived = new byte[HASH_BYTES];
        try {
            RANDOM.nextBytes(salt);
            derive(passwordBytes, salt, MEMORY_KIB, ITERATIONS, PARALLELISM, derived);
            Base64.Encoder encoder = Base64.getEncoder().withoutPadding();
            return "$argon2id$v=19$m=" + MEMORY_KIB + ",t=" + ITERATIONS + ",p=" + PARALLELISM
                    + "$" + encoder.encodeToString(salt) + "$" + encoder.encodeToString(derived);
        } finally {
            java.util.Arrays.fill(passwordBytes, (byte) 0);
            java.util.Arrays.fill(salt, (byte) 0);
            java.util.Arrays.fill(derived, (byte) 0);
            java.util.Arrays.fill(password, '\0');
        }
    }

    /** Returns false for malformed/cost-amplifying database values and clears caller input. */
    public boolean verify(char[] password, String encoded) {
        Objects.requireNonNull(password, "password");
        if (encoded == null) {
            java.util.Arrays.fill(password, '\0');
            return false;
        }
        byte[] passwordBytes;
        try {
            passwordBytes = encodeAndValidate(password);
        } catch (IllegalArgumentException exception) {
            return false;
        }
        try {
            ParsedHash parsed = parse(encoded);
            if (parsed == null) return false;
            byte[] actual = new byte[parsed.hash.length];
            try {
                derive(passwordBytes, parsed.salt, parsed.memoryKib, parsed.iterations, parsed.parallelism, actual);
                return MessageDigest.isEqual(actual, parsed.hash);
            } finally {
                java.util.Arrays.fill(actual, (byte) 0);
                parsed.clear();
            }
        } finally {
            java.util.Arrays.fill(passwordBytes, (byte) 0);
            java.util.Arrays.fill(password, '\0');
        }
    }

    public static void validateRegistrationPassword(char[] password) {
        byte[] encoded = encodeAndValidate(password);
        try {
            int codePoints = Character.codePointCount(password, 0, password.length);
            if (codePoints < MIN_REGISTRATION_CODE_POINTS) {
                throw new IllegalArgumentException("password must contain at least 12 characters");
            }
        } finally {
            java.util.Arrays.fill(encoded, (byte) 0);
        }
    }

    private static byte[] encodeAndValidate(char[] password) {
        Objects.requireNonNull(password, "password");
        int codePoints = Character.codePointCount(password, 0, password.length);
        if (codePoints < 1 || codePoints > MAX_PASSWORD_CODE_POINTS) {
            java.util.Arrays.fill(password, '\0');
            throw new IllegalArgumentException("password length is outside allowed bounds");
        }
        try {
            ByteBuffer bytes = StandardCharsets.UTF_8.newEncoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .encode(CharBuffer.wrap(password));
            if (bytes.remaining() > MAX_PASSWORD_UTF8_BYTES) {
                java.util.Arrays.fill(password, '\0');
                throw new IllegalArgumentException("password exceeds 512 UTF-8 bytes");
            }
            byte[] result = new byte[bytes.remaining()];
            bytes.get(result);
            if (bytes.hasArray()) java.util.Arrays.fill(bytes.array(), (byte) 0);
            return result;
        } catch (CharacterCodingException exception) {
            java.util.Arrays.fill(password, '\0');
            throw new IllegalArgumentException("password contains invalid Unicode", exception);
        }
    }

    private static ParsedHash parse(String encoded) {
        if (encoded.length() > 255) return null;
        Matcher matcher = PHC.matcher(encoded);
        if (!matcher.matches()) return null;
        try {
            int version = Integer.parseInt(matcher.group(1));
            int memory = Integer.parseInt(matcher.group(2));
            int iterations = Integer.parseInt(matcher.group(3));
            int parallelism = Integer.parseInt(matcher.group(4));
            byte[] salt = Base64.getDecoder().decode(matcher.group(5));
            byte[] hash = Base64.getDecoder().decode(matcher.group(6));
            if (version != 19 || memory < MEMORY_KIB || memory > 65_536
                    || iterations < ITERATIONS || iterations > 4
                    || parallelism < 1 || parallelism > 4 || memory < 8 * parallelism
                    || salt.length < SALT_BYTES || salt.length > 32 || hash.length != HASH_BYTES) {
                java.util.Arrays.fill(salt, (byte) 0);
                java.util.Arrays.fill(hash, (byte) 0);
                return null;
            }
            return new ParsedHash(memory, iterations, parallelism, salt, hash);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static void derive(byte[] password, byte[] salt, int memory, int iterations,
                               int parallelism, byte[] output) {
        Argon2Parameters parameters = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withMemoryAsKB(memory)
                .withIterations(iterations)
                .withParallelism(parallelism)
                .withSalt(salt)
                .build();
        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        try {
            generator.init(parameters);
            generator.generateBytes(password, output);
        } finally {
            parameters.clear();
        }
    }

    private record ParsedHash(int memoryKib, int iterations, int parallelism, byte[] salt, byte[] hash) {
        private void clear() {
            java.util.Arrays.fill(salt, (byte) 0);
            java.util.Arrays.fill(hash, (byte) 0);
        }
    }
}
