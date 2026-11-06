package nl.voxel.badges;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

/** Tiny web server that hands out the resource pack zip on its own port. */
public final class PackServer {

    public static final String PATH = "/voxel-badges.zip";

    private HttpServer server;
    private volatile byte[] zip = new byte[0];

    public void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext(PATH, exchange -> {
            byte[] data = zip;
            exchange.getResponseHeaders().add("Content-Type", "application/zip");
            exchange.sendResponseHeaders(200, data.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(data);
            }
        });
        pool = Executors.newFixedThreadPool(2);
        server.setExecutor(pool);
        server.start();
    }

    private java.util.concurrent.ExecutorService pool;

    public void update(byte[] data) {
        this.zip = data;
    }

    public void stop() {
        if (server != null) server.stop(0);
        if (pool != null) pool.shutdownNow();
    }
}
