import { z } from "zod";
import {
    BASE_URL,
    CACHE_EXTENSION_DOWNLOAD_URL,
    GITHUB_URL,
    MIME_TYPES,
    SUPPORTED_LOCALES,
    type SupportedLocale,
} from "@/lib/common/constants";

const LOCALE_SCHEMA = z.enum(SUPPORTED_LOCALES);

const HOME_MARKDOWN: Record<SupportedLocale, string> = {
    "en-US": `# Cache

> The AI bookmark manager for busy people. Collect, organize, and rediscover everything you've saved across platforms.

## What Cache does

- **Unify your bookmarks** — Bring saved content from Chrome, Instagram, TikTok, YouTube, X, GitHub, Pinterest, and Google Photos into one library.
- **Organize with collections** — Group saved items and use AI-assisted collections to keep related content together.
- **Find and revisit saved content** — Search your library, review saved items, and use automations to resurface useful content.
- **Work with your content** — Create notes, get AI summaries, share collections, and export to other tools.

## Agent access

Cache provides an authenticated MCP server for working with your library. See the [agent guide](${BASE_URL}/llms.txt) for setup and tool details.

## Links

- [Open Cache](${BASE_URL}/en-US)
- [Markdown sitemap](${BASE_URL}/api/markdown/sitemap)
- [MCP endpoint](${BASE_URL}/mcp)
- [Chrome extension](${CACHE_EXTENSION_DOWNLOAD_URL})
- [GitHub repository](${GITHUB_URL})
`,
    "es-ES": `# Cache

> El gestor de marcadores con IA para personas ocupadas. Recopila, organiza y vuelve a descubrir todo lo que has guardado en distintas plataformas.

## Qué hace Cache

- **Unifica tus marcadores** — Reúne en una biblioteca el contenido guardado en Chrome, Instagram, TikTok, YouTube, X, GitHub, Pinterest y Google Photos.
- **Organiza con colecciones** — Agrupa los elementos guardados y usa colecciones con ayuda de IA para mantener junto el contenido relacionado.
- **Encuentra y revisa lo que guardas** — Busca en tu biblioteca, revisa los elementos guardados y usa automatizaciones para recuperar contenido útil.
- **Trabaja con tu contenido** — Crea notas, genera resúmenes con IA, comparte colecciones y exporta a otras herramientas.

## Acceso para agentes

Cache ofrece un servidor MCP autenticado para trabajar con tu biblioteca. Consulta la [guía para agentes](${BASE_URL}/llms.txt) para ver la configuración y las herramientas disponibles.

## Enlaces

- [Abrir Cache](${BASE_URL}/es-ES)
- [Mapa del sitio en Markdown](${BASE_URL}/api/markdown/sitemap)
- [Endpoint MCP](${BASE_URL}/mcp)
- [Extensión de Chrome](${CACHE_EXTENSION_DOWNLOAD_URL})
- [Repositorio en GitHub](${GITHUB_URL})
`,
};

interface HomeMarkdownRouteContext {
    params: Promise<{ locale: string }>;
}

export async function GET(
    _request: Request,
    { params }: HomeMarkdownRouteContext
): Promise<Response> {
    const { locale } = await params;
    const parsedLocale = LOCALE_SCHEMA.safeParse(locale);
    if (!parsedLocale.success) {
        return new Response("Not Found\n", {
            headers: {
                "Content-Type": `${MIME_TYPES.text}; charset=utf-8`,
            },
            status: 404,
        });
    }

    return new Response(HOME_MARKDOWN[parsedLocale.data], {
        headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "Content-Type": `${MIME_TYPES.markdown}; charset=utf-8`,
        },
    });
}
