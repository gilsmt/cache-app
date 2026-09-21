import { describe, expect, test } from "bun:test";
import {
    buildDesktopReleaseDownloads,
    getDesktopLatestDownloadUrl,
    matchDesktopPlatform,
} from "@/lib/desktop/releases";

describe("matchDesktopPlatform", () => {
    test("matches canonical asset names", () => {
        expect(matchDesktopPlatform("Cache.dmg")).toBe("macos");
        expect(matchDesktopPlatform("Cache_x64.msi")).toBe("windows");
        expect(matchDesktopPlatform("Cache_x86_64.AppImage")).toBe("linux");
    });

    test("matches by extension fallback", () => {
        expect(matchDesktopPlatform("Something.dmg")).toBe("macos");
        expect(matchDesktopPlatform("Installer.exe")).toBe("windows");
        expect(matchDesktopPlatform("app.deb")).toBe("linux");
        expect(matchDesktopPlatform("notes.txt")).toBeNull();
    });
});

describe("getDesktopLatestDownloadUrl", () => {
    test("builds stable latest-download URLs", () => {
        expect(getDesktopLatestDownloadUrl("macos")).toBe(
            "https://github.com/gilsmt/cache-app/releases/latest/download/Cache.dmg"
        );
        expect(getDesktopLatestDownloadUrl("windows")).toBe(
            "https://github.com/gilsmt/cache-app/releases/latest/download/Cache_x64.msi"
        );
        expect(getDesktopLatestDownloadUrl("linux")).toBe(
            "https://github.com/gilsmt/cache-app/releases/latest/download/Cache_x86_64.AppImage"
        );
    });
});

describe("buildDesktopReleaseDownloads", () => {
    test("prefers AppImage over deb for Linux and keeps platform order", () => {
        const result = buildDesktopReleaseDownloads({
            assets: [
                {
                    browser_download_url:
                        "https://example.com/Cache_x86_64.deb",
                    name: "Cache_x86_64.deb",
                },
                {
                    browser_download_url: "https://example.com/Cache.dmg",
                    name: "Cache.dmg",
                },
                {
                    browser_download_url:
                        "https://example.com/Cache_x86_64.AppImage",
                    name: "Cache_x86_64.AppImage",
                },
                {
                    browser_download_url: "https://example.com/Cache_x64.msi",
                    name: "Cache_x64.msi",
                },
                {
                    browser_download_url: "https://example.com/README.md",
                    name: "README.md",
                },
            ],
            html_url: "https://github.com/gilsmt/cache-app/releases/v1.0.0",
            tag_name: "v1.0.0",
        });

        expect(result).not.toBeNull();
        if (!result) {
            throw new Error("expected desktop release downloads");
        }
        expect(result.version).toBe("1.0.0");
        expect(result.downloads.map((d) => d.platform)).toEqual([
            "macos",
            "windows",
            "linux",
        ]);
        expect(
            result.downloads.find((d) => d.platform === "linux")?.fileName
        ).toBe("Cache_x86_64.AppImage");
    });

    test("returns null when no desktop assets are present", () => {
        expect(
            buildDesktopReleaseDownloads({
                assets: [
                    {
                        browser_download_url: "https://example.com/source.zip",
                        name: "source.zip",
                    },
                ],
                html_url: "https://github.com/gilsmt/cache-app/releases/v1",
                tag_name: "v1",
            })
        ).toBeNull();
    });
});
