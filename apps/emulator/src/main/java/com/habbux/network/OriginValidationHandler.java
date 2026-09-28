package com.habbux.network;

import static io.netty.handler.codec.http.HttpResponseStatus.FORBIDDEN;
import static io.netty.handler.codec.http.HttpVersion.HTTP_1_1;

import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.websocketx.WebSocketVersion;
import com.habbux.session.ConnectionRegistry;
import java.util.Set;

final class OriginValidationHandler extends SimpleChannelInboundHandler<FullHttpRequest> {
    private final Set<String> allowedOrigins;
    private final ConnectionRegistry registry;

    OriginValidationHandler(Set<String> allowedOrigins, ConnectionRegistry registry) {
        this.allowedOrigins = allowedOrigins;
        this.registry = registry;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) {
        String upgrade = request.headers().get(HttpHeaderNames.UPGRADE);
        String origin = request.headers().get(HttpHeaderNames.ORIGIN);
        boolean websocket = WebSocketVersion.V13.toHttpHeaderValue().equalsIgnoreCase(request.headers().get("Sec-WebSocket-Version"))
                || "websocket".equalsIgnoreCase(upgrade);
        if (websocket && origin != null && !allowedOrigins.contains(origin)) {
            registry.rejectedConnection();
            ctx.writeAndFlush(new DefaultFullHttpResponse(HTTP_1_1, FORBIDDEN)).addListener(ChannelFutureListener.CLOSE);
            return;
        }
        ctx.fireChannelRead(request.retain());
    }
}
