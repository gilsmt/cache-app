import { cn } from "cn";
import type * as React from "react";

interface ErrorMessageProps extends React.ComponentProps<"p"> {}

export function ErrorMessage({ className, ...props }: ErrorMessageProps) {
    if (!props.children) {
        return null;
    }

    return (
        <p
            {...props}
            aria-atomic="true"
            aria-live="assertive"
            className={cn("text-destructive text-xs", className)}
            data-slot="error-message"
            role="alert"
        />
    );
}
