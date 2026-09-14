import { cn } from "cn";
import { Loader2Icon } from "lucide-react";
import type * as React from "react";

export function Spinner({
    className,
    ...props
}: React.ComponentProps<typeof Loader2Icon>) {
    if (props["aria-hidden"]) {
        const {
            "aria-hidden": ariaHidden,
            "aria-label": _ariaLabel,
            role: _role,
            ...rest
        } = props;

        return (
            <Loader2Icon
                {...rest}
                aria-hidden={ariaHidden}
                className={cn("animate-spin", className)}
                data-slot="spinner"
            />
        );
    }

    return (
        <Loader2Icon
            aria-label="Loading"
            role="status"
            {...props}
            className={cn("animate-spin", className)}
            data-slot="spinner"
        />
    );
}
