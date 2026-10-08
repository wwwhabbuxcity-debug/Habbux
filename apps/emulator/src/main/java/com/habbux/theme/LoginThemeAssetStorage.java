package com.habbux.theme;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;

/** Stores only validated raster files in the directory served by the dedicated Nginx allow-list. */
public final class LoginThemeAssetStorage {
    public static final int MAX_BYTES = 2_000_000;
    private static final int MIN_WIDTH = 640;
    private static final int MIN_HEIGHT = 360;
    private static final int MAX_DIMENSION = 4_096;
    private static final long MAX_PIXELS = 8_000_000L;
    private static final Set<PosixFilePermission> PUBLIC_FILE = EnumSet.of(PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE, PosixFilePermission.GROUP_READ, PosixFilePermission.OTHERS_READ);
    private final Path directory;

    public LoginThemeAssetStorage(Path directory) {
        this.directory = Objects.requireNonNull(directory, "directory").toAbsolutePath().normalize();
    }

    public String save(byte[] bytes, String contentType) {
        Objects.requireNonNull(bytes, "bytes");
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("invalid image size");
        String extension = extension(contentType, bytes);
        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(bytes));
        } catch (IOException exception) {
            throw new IllegalArgumentException("invalid image data", exception);
        }
        if (image == null || image.getWidth() < MIN_WIDTH || image.getHeight() < MIN_HEIGHT
                || image.getWidth() > MAX_DIMENSION || image.getHeight() > MAX_DIMENSION
                || (long) image.getWidth() * image.getHeight() > MAX_PIXELS) {
            throw new IllegalArgumentException("invalid image dimensions");
        }
        try {
            Files.createDirectories(directory);
            String asset = UUID.randomUUID() + extension;
            Path target = directory.resolve(asset).normalize();
            if (!target.getParent().equals(directory)) throw new IllegalStateException("invalid asset path");
            Path temporary = Files.createTempFile(directory, ".upload-", ".tmp");
            try {
                Files.write(temporary, bytes);
                try {
                    Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, target);
                }
                try { Files.setPosixFilePermissions(target, PUBLIC_FILE); }
                catch (UnsupportedOperationException ignored) { /* Linux production supports POSIX permissions. */ }
                return asset;
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException exception) {
            throw new LoginThemeAssetException("unable to store login theme asset", exception);
        }
    }

    public void delete(String asset) {
        if (asset == null || asset.equals("default")) return;
        try {
            Path target = directory.resolve(asset).normalize();
            if (!target.getParent().equals(directory)) return;
            Files.deleteIfExists(target);
        } catch (IOException exception) {
            throw new LoginThemeAssetException("unable to remove login theme asset", exception);
        }
    }

    private static String extension(String contentType, byte[] bytes) {
        String normalized = Objects.requireNonNull(contentType, "content type").split(";", 2)[0].strip().toLowerCase(java.util.Locale.ROOT);
        if ("image/png".equals(normalized) && png(bytes)) return ".png";
        if ("image/jpeg".equals(normalized) && jpeg(bytes)) return ".jpg";
        throw new IllegalArgumentException("only PNG and JPEG images are accepted");
    }

    private static boolean png(byte[] bytes) {
        return bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e
                && bytes[3] == 0x47 && bytes[4] == 0x0d && bytes[5] == 0x0a && bytes[6] == 0x1a && bytes[7] == 0x0a;
    }

    private static boolean jpeg(byte[] bytes) {
        return bytes.length >= 4 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8
                && bytes[bytes.length - 2] == (byte) 0xff && bytes[bytes.length - 1] == (byte) 0xd9;
    }

    public static final class LoginThemeAssetException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        LoginThemeAssetException(String message, Throwable cause) { super(message, cause); }
    }
}
