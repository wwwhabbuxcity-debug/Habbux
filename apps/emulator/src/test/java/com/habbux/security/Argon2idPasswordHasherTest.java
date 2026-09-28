package com.habbux.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class Argon2idPasswordHasherTest {
    private final Argon2idPasswordHasher hasher = new Argon2idPasswordHasher();

    @Test
    void hashesAndVerifiesWithArgon2idAndClearsInputs() {
        char[] input = "correct horse battery staple".toCharArray();
        String encoded = hasher.hash(input);
        assertTrue(encoded.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"));
        assertTrue(allZero(input));
        assertTrue(hasher.verify("correct horse battery staple".toCharArray(), encoded));
        assertFalse(hasher.verify("incorrect password".toCharArray(), encoded));
        assertFalse(hasher.verify("anything".toCharArray(), "$argon2id$v=19$m=999999999,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE"));
        char[] rejectedInput = "discard this".toCharArray();
        assertFalse(hasher.verify(rejectedInput, null));
        assertTrue(allZero(rejectedInput));
    }

    @Test
    void enforcesPasswordBoundsBeforeHashing() {
        char[] tooLong = "x".repeat(129).toCharArray();
        assertThrows(IllegalArgumentException.class, () -> hasher.hash(tooLong));
        assertTrue(allZero(tooLong));
        assertThrows(IllegalArgumentException.class,
                () -> Argon2idPasswordHasher.validateRegistrationPassword("short".toCharArray()));
        assertThrows(IllegalArgumentException.class,
                () -> hasher.hash(new char[] {'\uD800'}));
    }

    private static boolean allZero(char[] chars) {
        return Arrays.stream(toIntArray(chars)).allMatch(value -> value == 0);
    }

    private static int[] toIntArray(char[] chars) {
        int[] values = new int[chars.length];
        for (int index = 0; index < chars.length; index++) values[index] = chars[index];
        return values;
    }
}
