import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import copy from "copy-to-clipboard";
import * as React from "react";
import { canUseDOM } from "@/lib/common/dom";

const DEFAULT_COPY_RESET_TIMEOUT_MS = 2000;

interface UseCopyToClipboardOptions {
    onCopy?: () => void;
    timeoutMs?: number;
}

interface UseCopyToClipboardResult {
    copyToClipboard: (value: string) => Promise<boolean>;
    isCopied: boolean;
}

/**
 * Copies text to the clipboard and tracks a transient `isCopied` state that
 * resets automatically after `timeoutMs`.
 */
export function useCopyToClipboard({
    timeoutMs = DEFAULT_COPY_RESET_TIMEOUT_MS,
    onCopy: onCopyProp,
}: UseCopyToClipboardOptions = {}): UseCopyToClipboardResult {
    const [isCopied, setIsCopied] = React.useState(false);
    const timeout = useTimeout();

    const onCopy = useStableCallback(onCopyProp);

    const copyToClipboard = useStableCallback(async (value: string) => {
        if (!(canUseDOM && value)) {
            return false;
        }

        const success = await copy(value);
        if (!success) {
            return false;
        }

        setIsCopied(true);
        onCopy?.();

        if (timeoutMs !== 0) {
            timeout.start(timeoutMs, () => {
                setIsCopied(false);
            });
        }

        return true;
    });

    return { copyToClipboard, isCopied };
}
