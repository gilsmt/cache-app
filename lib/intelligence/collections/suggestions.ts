import {
    type CollectionTemplateOption,
    TEMPLATES,
} from "@/lib/collections/templates";
import { normalizeCollectionName } from "@/lib/common/string";

const MAX_SUGGESTIONS = 2;

export function suggestCollectionTemplates(args: {
    existingNameKeys: ReadonlySet<string>;
}): CollectionTemplateOption[] {
    return TEMPLATES.filter(
        (template) =>
            !args.existingNameKeys.has(
                normalizeCollectionName(template.name).nameKey
            )
    ).slice(0, MAX_SUGGESTIONS);
}
