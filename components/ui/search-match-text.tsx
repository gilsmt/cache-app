import { splitSearchMatches } from "@/lib/common/search-match";

export function SearchMatchText({
    query,
    text,
}: {
    query: string;
    text: string;
}) {
    return splitSearchMatches(text, query).map(
        ({ highlight, start, text: chunk }) =>
            highlight ? (
                <mark className="bg-(--accent-color)/50" key={start}>
                    {chunk}
                </mark>
            ) : (
                chunk
            )
    );
}
