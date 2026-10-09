package com.habbux.protocol;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class FrameCodecTest {
    private final FrameCodec codec = new FrameCodec();

    @Test
    void javaAndTypeScriptGoldenVectorsAreCanonical() throws IOException, ProtocolException {
        var stream = getClass().getClassLoader().getResourceAsStream("golden-vectors-v1.txt");
        String text = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        for (String line : text.split("\\R")) {
            if (line.isBlank() || line.startsWith("#")) continue;
            String[] fields = line.split("\\|");
            HabbuxFrame frame = new HabbuxFrame(
                    Integer.parseInt(fields[0]), Integer.parseInt(fields[1]), Integer.parseInt(fields[2]),
                    fields[3].equals("-") ? new byte[0] : hex(fields[3]));
            ByteBuf encoded = codec.encode(UnpooledByteBufAllocatorHolder.ALLOCATOR, frame, 65_536);
            try {
                assertEquals(fields[4], toHex(encoded));
                HabbuxFrame decoded = codec.decode(encoded, 65_536);
                assertEquals(frame.version(), decoded.version());
                assertEquals(frame.messageId(), decoded.messageId());
                assertEquals(frame.flags(), decoded.flags());
                assertArrayEquals(frame.payload(), decoded.payload());
            } finally {
                encoded.release();
            }
        }
    }

    @Test
    void registryIdsRemainInSyncWithJavaEnums() throws IOException {
        String json = new String(getClass().getClassLoader().getResourceAsStream("protocol.json").readAllBytes(), StandardCharsets.UTF_8);
        Matcher matcher = Pattern.compile("\\{\\s*\"id\"\\s*:\\s*(\\d+)\\s*,\\s*\"name\"\\s*:\\s*\"([A-Z_]+)\"").matcher(json);
        int count = 0;
        while (matcher.find()) {
            CoreMessage message = CoreMessage.valueOf(matcher.group(2));
            assertEquals(message.id(), Integer.parseInt(matcher.group(1)));
            count++;
        }
        assertEquals(CoreMessage.values().length, count);
    }

    @Test
    void acceptsEmptyAndPayloadAtConfiguredLimit() throws ProtocolException {
        roundTrip(new HabbuxFrame(1, 1, 0, new byte[0]), 0);
        byte[] maxPayload = new byte[65_536];
        Arrays.fill(maxPayload, (byte) 0x5a);
        roundTrip(new HabbuxFrame(1, 3, 0, maxPayload), 65_536);
    }

    @Test
    void rejectsOverLimitVersionIdFlagsAndLengthsBeforePayloadAllocation() {
        byte[] payload = new byte[65_537];
        assertThrows(IllegalArgumentException.class,
                () -> codec.encode(UnpooledByteBufAllocatorHolder.ALLOCATOR, new HabbuxFrame(1, 3, 0, payload), 65_536));
        assertDecodeFails("0200010000000000", ProtocolException.Category.UNSUPPORTED_VERSION);
        assertDecodeFails("0100ff0000000000", ProtocolException.Category.UNKNOWN_MESSAGE);
        assertDecodeFails("0100010100000000", ProtocolException.Category.INVALID_FLAGS);
        assertDecodeFails("0100030000010001", ProtocolException.Category.PAYLOAD_TOO_LARGE);
        assertDecodeFails("0100030000000001", ProtocolException.Category.TRUNCATED);
        assertDecodeFails("010003000000000000", ProtocolException.Category.INVALID_LENGTH);
        assertDecodeFails("0100", ProtocolException.Category.TRUNCATED);
    }

    @Test
    void rejectsTwoFramesConcatenatedInsideOneWebSocketMessage() {
        ByteBuf input = Unpooled.wrappedBuffer(hex("01000100000000000100010000000000"));
        try {
            ProtocolException exception = assertThrows(ProtocolException.class, () -> codec.decode(input, 65_536));
            assertEquals(ProtocolException.Category.INVALID_LENGTH, exception.category());
        } finally {
            input.release();
        }
    }

    @Test
    void deterministicMalformedInputsNeverEscapeAsUnexpectedRuntimeFailures() {
        Random random = new Random(0x484142425558L);
        for (int index = 0; index < 2_000; index++) {
            byte[] bytes = new byte[random.nextInt(96)];
            random.nextBytes(bytes);
            ByteBuf input = Unpooled.wrappedBuffer(bytes);
            try {
                assertThrows(ProtocolException.class, () -> codec.decode(input, 65_536));
            } finally {
                input.release();
            }
        }
    }

    @Test
    void decodedPayloadIsDefensivelyCopied() throws ProtocolException {
        byte[] payload = { 1, 2, 3, 4 };
        HabbuxFrame original = new HabbuxFrame(1, 3, 0, payload);
        payload[0] = 9;
        ByteBuf encoded = codec.encode(UnpooledByteBufAllocatorHolder.ALLOCATOR, original, 65_536);
        try {
            HabbuxFrame decoded = codec.decode(encoded, 65_536);
            byte[] exposed = decoded.payload();
            exposed[0] = 8;
            assertArrayEquals(new byte[] { 1, 2, 3, 4 }, decoded.payload());
        } finally {
            encoded.release();
        }
    }

    private void roundTrip(HabbuxFrame frame, int limit) throws ProtocolException {
        ByteBuf encoded = codec.encode(UnpooledByteBufAllocatorHolder.ALLOCATOR, frame, limit);
        try {
            assertArrayEquals(frame.payload(), codec.decode(encoded, limit).payload());
        } finally {
            encoded.release();
        }
    }

    private void assertDecodeFails(String encodedHex, ProtocolException.Category category) {
        ByteBuf input = Unpooled.wrappedBuffer(hex(encodedHex));
        try {
            ProtocolException exception = assertThrows(ProtocolException.class, () -> codec.decode(input, 65_536));
            assertEquals(category, exception.category());
        } finally {
            input.release();
        }
    }

    private static byte[] hex(String value) {
        byte[] bytes = new byte[value.length() / 2];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }

    private static String toHex(ByteBuf input) {
        StringBuilder output = new StringBuilder(input.readableBytes() * 2);
        for (int i = input.readerIndex(); i < input.writerIndex(); i++) output.append(String.format("%02x", input.getUnsignedByte(i)));
        return output.toString();
    }

    /** Heap allocator keeps golden-vector tests independent of any Netty event loop. */
    private static final class UnpooledByteBufAllocatorHolder {
        private static final io.netty.buffer.ByteBufAllocator ALLOCATOR = UnpooledByteBufAllocatorHolder.create();
        private static io.netty.buffer.ByteBufAllocator create() { return io.netty.buffer.UnpooledByteBufAllocator.DEFAULT; }
    }
}
