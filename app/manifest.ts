import type { MetadataRoute } from "next";
import { APP_NAME, DEFAULT_LOCALE } from "@/lib/common/constants";

export default function manifest(): MetadataRoute.Manifest {
    return {
        background_color: "#ffffff",
        categories: ["productivity", "utilities"],
        description:
            "Cache is a tool to unify your bookmarks across all platforms.",
        dir: "ltr",
        display: "standalone",
        icons: [
            {
                purpose: "any",
                sizes: "192x192",
                src: "/web-app-manifest-192x192.png",
                type: "image/png",
            },
            {
                purpose: "any",
                sizes: "512x512",
                src: "/web-app-manifest-512x512.png",
                type: "image/png",
            },
            {
                purpose: "maskable",
                sizes: "192x192",
                src: "/web-app-manifest-192x192.png",
                type: "image/png",
            },
            {
                purpose: "maskable",
                sizes: "512x512",
                src: "/web-app-manifest-512x512.png",
                type: "image/png",
            },
        ],
        id: "/",
        lang: DEFAULT_LOCALE,
        launch_handler: {
            client_mode: "navigate-existing",
        },
        name: APP_NAME,
        orientation: "any",
        scope: "/",
        short_name: APP_NAME,
        start_url: "/?utm_source=pwa_homescreen&__pwa=1",
        theme_color: "#ffffff",
    };
}
