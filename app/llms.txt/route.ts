const content = `# Cache
> Cache brings saved links, notes, and other content into one searchable library. Organize saves into collections, find them later, and use AI to turn them into useful work.

- Website: https://www.cachd.app
- Documentation: https://docs.cachd.app
- Source code: https://github.com/gilsmt/cache-app

## Product

- **Library** — Save bookmarks, notes, and folders. An item can belong to more than one collection.
- **Collections** — Group items, set collection priority, write descriptions, and share a collection with a public link. Recipients do not need a Cache account.
- **Smart Collections** — When enabled, AI files new items into existing collections or creates a collection when needed. You can turn it off at any time.
- **Ask Cache** — Ask questions about saved content, search the library, change the current library view, and use web search for research.
- **Summaries** — Generate short or expanded summaries for groups of results and draft collection descriptions.
- **Automations** — Schedule recurring AI tasks for the whole library or a collection. Choose a template or write a custom prompt; results appear as assistant threads.
- **Library insights** — Review save activity, sources, favorites, duplicate saves, and links that no longer respond.
- **Notion export** — Send Cache notes and collections to Notion.

## Bring content into Cache

- **Browser** — Sync Chrome bookmarks and clip pages with the Cache browser extension.
- **Saved items** — Import saved content from Instagram, TikTok, YouTube Watch Later, X/Twitter, GitHub stars, Pinterest, Reddit, and Google Photos.
- **RSS** — Add feeds and import new entries.
- **Markdown** — Import Markdown files, including exports from Obsidian, Bear, and Apple Notes.

## Hosted plan access

- Free accounts can save items without an item-count limit. The app's library view previews up to 12 items.
- Pro unlocks the full library view, scheduled automations, and public sharing for collections that include items beyond the free preview.
- AI features have usage quotas that vary by plan. Pro is available with monthly or yearly billing.

## MCP server

Cache exposes an MCP server so an authorized AI client can read and write the user's library.

- Endpoint: https://www.cachd.app/mcp
- In Cache, open **Integrations → MCP** to copy a setup prompt with a user-scoped bearer token.
- While signed in, \`POST https://www.cachd.app/mcp/prompt\` returns JSON with the \`endpoint\`, \`token\`, and \`prompt\` fields.
- Send the token as \`Authorization: Bearer <token>\` on MCP requests. Treat it as a secret.
- An authenticated \`DELETE https://www.cachd.app/mcp/prompt\` revokes all MCP tokens for the account.

Example Claude Desktop configuration (\`claude_desktop_config.json\`):

\`\`\`json
{
  "mcpServers": {
    "cache": {
      "url": "https://www.cachd.app/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
\`\`\`

### MCP tools

| Tool | Purpose | Parameters |
|------|---------|------------|
| \`list_library_items\` | Search and paginate bookmarks and notes; search is a case-insensitive substring match across captions, URLs, and note text. | \`search?\`, \`collectionId?\`, \`limit?\` (1-50, default 20), \`offset?\` (default 0) |
| \`get_library_item\` | Read one item by ID. | \`itemId\` |
| \`add_library_item\` | Save a bookmark or a plain-text note. Pass exactly one of the two supported shapes. | Bookmark: \`url\` and optional \`caption\`; note: \`noteContentText\` |
| \`delete_library_item\` | Delete an item. Repeating a delete is safe. | \`itemId\` |
| \`list_collections\` | List collections with item counts. | None |

Bookmark saves deduplicate by URL. Saving the same URL again reuses the item and can update its caption. Each note call creates a new note. Read tools require the \`library:read\` scope; add and delete require \`library:write\`.

## Data model

- **Library item** — A bookmark, folder, or note, with a \`kind\`, a \`source\`, and fields such as caption, URL, and note text.
- **Collection** — A named group of library items. Items can be in multiple collections; collections can have a description, priority, and public share link.

Item sources include Chrome bookmarks and extension clips, Google Photos, GitHub starred repositories, Instagram, Markdown imports, Pinterest, Reddit saved items, RSS feeds, TikTok, X bookmarks, YouTube Watch Later, notes, and items saved directly through Cache or MCP.
`;

export const GET = () =>
    new Response(content, {
        headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "Content-Type": "text/markdown; charset=utf-8",
        },
    });
