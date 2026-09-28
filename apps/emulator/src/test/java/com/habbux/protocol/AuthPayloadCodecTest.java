package com.habbux.protocol;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class AuthPayloadCodecTest {
    @Test
    void decodesBoundedLoginAndClearsInput() throws Exception {
        byte[] payload = fields("alice", "correct horse");
        try (AuthPayloadCodec.Login login = AuthPayloadCodec.decodeLogin(payload)) {
            assertEquals("alice", login.identifier());
            assertArrayEquals(new byte[payload.length], payload);
            char[] password = login.takePassword();
            assertEquals("correct horse", new String(password));
            Arrays.fill(password, '\0');
        }
    }

    @Test
    void rejectsTruncatedOversizedTrailingAndInvalidUtf8CredentialFields() {
        for (byte[] payload : new byte[][] {
                new byte[] { 0 },
                new byte[] { 0, 1, 0x61, 2, 1 }, // password byte length 513
                concat(fields("alice", "password"), new byte[] { 1 }),
                new byte[] { 0, 1, (byte) 0xff, 0, 1, 0x61 },
        }) {
            byte[] original = payload.clone();
            assertThrows(AuthPayloadCodec.MalformedAuthPayloadException.class,
                    () -> AuthPayloadCodec.decodeLogin(payload));
            assertArrayEquals(new byte[original.length], payload);
        }
    }

    @Test
    void registrationBoundsTextAndClearsCredentialBytes() throws Exception {
        byte[] username = "Alice_7".getBytes(StandardCharsets.UTF_8);
        byte[] email = "alice@example.test".getBytes(StandardCharsets.UTF_8);
        byte[] password = "test".getBytes(StandardCharsets.UTF_8);
        ByteBuffer payload = ByteBuffer.allocate(6 + username.length + email.length + password.length)
                .putShort((short) username.length).put(username)
                .putShort((short) email.length).put(email)
                .putShort((short) password.length).put(password);
        byte[] bytes = payload.array();
        try (AuthPayloadCodec.Registration registration = AuthPayloadCodec.decodeRegistration(bytes)) {
            assertEquals("Alice_7", registration.username());
            assertEquals("alice@example.test", registration.email());
            assertArrayEquals(new byte[bytes.length], bytes);
            char[] taken = registration.takePassword();
            assertEquals("test", new String(taken));
            Arrays.fill(taken, '\0');
        }
    }

    private static byte[] fields(String first, String second) {
        byte[] a = first.getBytes(StandardCharsets.UTF_8);
        byte[] b = second.getBytes(StandardCharsets.UTF_8);
        return ByteBuffer.allocate(4 + a.length + b.length)
                .putShort((short) a.length).put(a).putShort((short) b.length).put(b).array();
    }

    private static byte[] concat(byte[] left, byte[] right) {
        byte[] joined = Arrays.copyOf(left, left.length + right.length);
        System.arraycopy(right, 0, joined, left.length, right.length);
        return joined;
    }
}
