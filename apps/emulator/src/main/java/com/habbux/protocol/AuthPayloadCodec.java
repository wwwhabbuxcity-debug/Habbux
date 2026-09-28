package com.habbux.protocol;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Strict, length-first codec for bounded authentication payloads. */
public final class AuthPayloadCodec {
    private static final int MAX_LOGIN_BYTES = 254;
    private static final int MAX_USERNAME_BYTES = 20;
    private static final int MAX_PASSWORD_BYTES = 512;
    private static final int MAX_EMAIL_BYTES = 254;

    private AuthPayloadCodec() { }

    /** Takes ownership of payload and clears it, including on malformed input. */
    public static Login decodeLogin(byte[] payload) throws MalformedAuthPayloadException {
        char[] password = null;
        try {
            Cursor cursor = new Cursor(payload);
            String login = cursor.readText(1, MAX_LOGIN_BYTES);
            password = cursor.readPassword(1, MAX_PASSWORD_BYTES);
            cursor.requireEnd();
            Login result = new Login(login, password);
            password = null;
            return result;
        } catch (RuntimeException | CharacterCodingException exception) {
            throw new MalformedAuthPayloadException(exception);
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            Arrays.fill(payload, (byte) 0);
        }
    }

    /** Takes ownership of payload and clears it, including on malformed input. */
    public static Registration decodeRegistration(byte[] payload) throws MalformedAuthPayloadException {
        char[] password = null;
        try {
            Cursor cursor = new Cursor(payload);
            String username = cursor.readText(3, MAX_USERNAME_BYTES);
            String email = cursor.readText(3, MAX_EMAIL_BYTES);
            password = cursor.readPassword(1, MAX_PASSWORD_BYTES);
            cursor.requireEnd();
            Registration result = new Registration(username, email, password);
            password = null;
            return result;
        } catch (RuntimeException | CharacterCodingException exception) {
            throw new MalformedAuthPayloadException(exception);
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            Arrays.fill(payload, (byte) 0);
        }
    }

    public static byte[] encodeSuccess(long userId, String username) {
        if (userId <= 0) throw new IllegalArgumentException("userId must be positive");
        byte[] name = username.getBytes(StandardCharsets.UTF_8);
        if (name.length < 3 || name.length > MAX_USERNAME_BYTES) throw new IllegalArgumentException("username size invalid");
        return ByteBuffer.allocate(Long.BYTES + Short.BYTES + name.length)
                .putLong(userId).putShort((short) name.length).put(name).array();
    }

    private static String decodeText(byte[] bytes) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString();
    }

    public static final class Login implements AutoCloseable {
        private final String identifier;
        private char[] password;

        private Login(String identifier, char[] password) { this.identifier = identifier; this.password = password; }
        public String identifier() { return identifier; }
        public char[] takePassword() {
            if (password == null) throw new IllegalStateException("password already transferred");
            char[] transferred = password;
            password = null;
            return transferred;
        }
        @Override public void close() { if (password != null) Arrays.fill(password, '\0'); }
        @Override public String toString() { return "Login[identifier=<redacted>, password=<redacted>]"; }
    }

    public static final class Registration implements AutoCloseable {
        private final String username;
        private final String email;
        private char[] password;

        private Registration(String username, String email, char[] password) {
            this.username = username;
            this.email = email;
            this.password = password;
        }
        public String username() { return username; }
        public String email() { return email; }
        public char[] takePassword() {
            if (password == null) throw new IllegalStateException("password already transferred");
            char[] transferred = password;
            password = null;
            return transferred;
        }
        @Override public void close() { if (password != null) Arrays.fill(password, '\0'); }
        @Override public String toString() { return "Registration[username=<redacted>, email=<redacted>, password=<redacted>]"; }
    }

    public static final class MalformedAuthPayloadException extends Exception {
        private static final long serialVersionUID = 1L;
        private MalformedAuthPayloadException(Throwable cause) { super("Malformed authentication payload", cause); }
    }

    private static final class Cursor {
        private final byte[] payload;
        private int offset;

        private Cursor(byte[] payload) { this.payload = payload; }

        private int readLength(int minimum, int maximum) {
            if (payload.length - offset < Short.BYTES) throw new IllegalArgumentException("truncated length");
            int length = Short.toUnsignedInt(ByteBuffer.wrap(payload, offset, Short.BYTES).getShort());
            offset += Short.BYTES;
            if (length < minimum || length > maximum || length > payload.length - offset) {
                throw new IllegalArgumentException("field length outside bounds");
            }
            return length;
        }

        private byte[] readBytes(int length) {
            byte[] value = Arrays.copyOfRange(payload, offset, offset + length);
            offset += length;
            return value;
        }

        private String readText(int minimum, int maximum) throws CharacterCodingException {
            byte[] bytes = readBytes(readLength(minimum, maximum));
            try { return decodeText(bytes); }
            finally { Arrays.fill(bytes, (byte) 0); }
        }

        private char[] readPassword(int minimum, int maximum) throws CharacterCodingException {
            byte[] bytes = readBytes(readLength(minimum, maximum));
            CharBuffer chars = null;
            try {
                chars = StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes));
                char[] result = new char[chars.remaining()];
                chars.get(result);
                return result;
            } finally {
                if (chars != null && chars.hasArray()) Arrays.fill(chars.array(), '\0');
                Arrays.fill(bytes, (byte) 0);
            }
        }

        private void requireEnd() {
            if (offset != payload.length) throw new IllegalArgumentException("trailing authentication bytes");
        }
    }
}
