package com.habbux.room;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Loads the prevalidated compact resource once during bootstrap, never during movement. */
public final class RoomModelLoader {
    private RoomModelLoader() { }

    public static List<RoomModelDefinition> loadDefault() {
        InputStream resource = RoomModelLoader.class.getResourceAsStream("/room-models-v1/models.tsv");
        if (resource == null) throw new IllegalStateException("room model resource is missing");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource, StandardCharsets.UTF_8))) {
            List<RoomModelDefinition> models = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] fields = line.split("\\t", -1);
                if (fields.length != 7) throw new IllegalArgumentException("room model resource row has invalid columns");
                int width = parsePositive(fields[1], "width");
                int height = parsePositive(fields[2], "height");
                String[] rows = fields[6].split(",", -1);
                if (rows.length != height) throw new IllegalArgumentException("room model resource row count is invalid");
                byte[] elevations = new byte[width * height];
                for (int y = 0; y < height; y++) {
                    if (rows[y].length() != width) throw new IllegalArgumentException("room model row width is invalid");
                    for (int x = 0; x < width; x++) {
                        char raw = rows[y].charAt(x);
                        elevations[y * width + x] = raw == 'x' || raw == 'X' ? (byte) -1 : parseElevation(raw);
                    }
                }
                models.add(new RoomModelDefinition(fields[0], width, height, elevations,
                        parseNonNegative(fields[3], "door x"), parseNonNegative(fields[4], "door y"),
                        parseNonNegative(fields[5], "door direction")));
            }
            if (models.isEmpty()) throw new IllegalArgumentException("room model resource is empty");
            return List.copyOf(models);
        } catch (IOException failure) {
            throw new IllegalStateException("room model resource could not be read", failure);
        }
    }

    private static byte parseElevation(char raw) {
        int value = Character.digit(raw, 36);
        if (value < 0 || value > 35) throw new IllegalArgumentException("unsupported heightmap character");
        return (byte) value;
    }
    private static int parsePositive(String value, String label) {
        int parsed = parseNonNegative(value, label);
        if (parsed < 1) throw new IllegalArgumentException(label + " must be positive");
        return parsed;
    }
    private static int parseNonNegative(String value, String label) {
        try { int parsed = Integer.parseInt(value); if (parsed < 0) throw new NumberFormatException(); return parsed; }
        catch (NumberFormatException invalid) { throw new IllegalArgumentException(label + " is invalid"); }
    }
}
