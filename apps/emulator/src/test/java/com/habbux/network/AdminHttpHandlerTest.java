package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.admin.HotelSettings;
import com.habbux.admin.HotelSettingsService;
import com.habbux.admin.HotelSettingsStore;
import com.habbux.config.AppConfig;
import com.habbux.session.ConnectionRegistry;
import com.habbux.theme.LoginThemeService;
import io.netty.buffer.Unpooled;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.DefaultFullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpVersion;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;

class AdminHttpHandlerTest {
    @Test
    void returnsAReadOnlyOverviewFromTheInMemorySnapshot() {
        try (HotelSettingsService settings = new HotelSettingsService(new MemoryStore())) {
            EmbeddedChannel channel = new EmbeddedChannel(new AdminHttpHandler(config(), new ConnectionRegistry(4), null, settings));
            try {
                channel.writeInbound(new DefaultFullHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, "/admin-api/v1/overview"));
                FullHttpResponse response = channel.readOutbound();
                try {
                    assertEquals(HttpResponseStatus.OK, response.status());
                    String json = response.content().toString(StandardCharsets.UTF_8);
                    assertTrue(json.contains("\"hotelName\":\"Habbux\""));
                    assertTrue(json.contains("\"activeSessions\":0"));
                } finally {
                    response.release();
                }
            } finally {
                channel.finishAndReleaseAll();
            }
        }
    }

    @Test
    void rejectsCrossSiteConfigurationWritesBeforeTheyReachTheStore() {
        try (HotelSettingsService settings = new HotelSettingsService(new MemoryStore())) {
            EmbeddedChannel channel = new EmbeddedChannel(new AdminHttpHandler(config(), new ConnectionRegistry(4), null, settings));
            try {
                DefaultFullHttpRequest request = new DefaultFullHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.PUT,
                        "/admin-api/v1/settings", Unpooled.copiedBuffer(
                        "hotelName=Habbux&motd=Oi&registrationsEnabled=true&maintenanceEnabled=false", StandardCharsets.UTF_8));
                request.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/x-www-form-urlencoded");
                request.headers().set(HttpHeaderNames.ORIGIN, "https://untrusted.example");
                channel.writeInbound(request);
                FullHttpResponse response = channel.readOutbound();
                try {
                    assertEquals(HttpResponseStatus.FORBIDDEN, response.status());
                    assertEquals(HotelSettings.defaults(), settings.current());
                } finally {
                    response.release();
                }
            } finally {
                channel.finishAndReleaseAll();
            }
        }
    }

    @Test
    void exposesOnlyTheActiveThemePresentationWithoutAdminAuthenticationState() throws Exception {
        try (HotelSettingsService settings = new HotelSettingsService(new MemoryStore());
             LoginThemeService themes = LoginThemeService.unavailable()) {
            EmbeddedChannel channel = new EmbeddedChannel(new AdminHttpHandler(config(), new ConnectionRegistry(4), null, settings, themes));
            try {
                channel.writeInbound(new DefaultFullHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, "/login-theme/v1/active"));
                FullHttpResponse response = channel.readOutbound();
                try {
                    assertEquals(HttpResponseStatus.OK, response.status());
                    String json = response.content().toString(StandardCharsets.UTF_8);
                    assertTrue(json.contains("\"theme\":\"neon-purple\""));
                    assertTrue(json.contains("\"assetUrl\":\"/themes/neon-purple.webp\""));
                    assertTrue(!json.contains("heroAsset"));
                } finally {
                    response.release();
                }
            } finally {
                channel.finishAndReleaseAll();
            }
        }
    }

    private static AppConfig config() {
        return new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536, 10_000,
                30, 4, 3, 30, 60, Set.of("https://tyvo.online"));
    }

    private static final class MemoryStore implements HotelSettingsStore {
        private HotelSettings current = HotelSettings.defaults();

        @Override
        public HotelSettings load() { return current; }

        @Override
        public HotelSettings save(HotelSettings settings) { return current = settings; }
    }
}
