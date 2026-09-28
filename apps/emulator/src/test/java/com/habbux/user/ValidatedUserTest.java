package com.habbux.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

class ValidatedUserTest {
    @Test
    void normalizesLoginAndRegistrationWithoutLosingDisplayUsername() {
        ValidatedUser user = ValidatedUser.create("Andre_7", "Andre@example.test");
        assertEquals("Andre_7", user.username());
        assertEquals("andre_7", user.usernameNormalized());
        assertEquals("andre@example.test", user.emailNormalized());
        assertEquals(new LoginIdentifier("andre_7", LoginIdentifier.Kind.USERNAME), LoginIdentifier.from("ANDRE_7"));
        assertEquals(new LoginIdentifier("andre@example.test", LoginIdentifier.Kind.EMAIL),
                LoginIdentifier.from("Andre@example.test"));
    }

    @Test
    void rejectsAmbiguousUsernamesAndMalformedEmail() {
        assertThrows(IllegalArgumentException.class, () -> ValidatedUser.create("a b", "a@example.test"));
        assertThrows(IllegalArgumentException.class, () -> ValidatedUser.create(" valid_user", "a@example.test"));
        assertThrows(IllegalArgumentException.class, () -> ValidatedUser.create("valid_user", "a..b@example.test"));
        assertThrows(IllegalArgumentException.class, () -> ValidatedUser.create("valid_user", "a@-bad.example"));
        assertThrows(IllegalArgumentException.class, () -> LoginIdentifier.from("two@@example.test"));
    }
}
