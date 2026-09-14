import { cn } from "cn";
import type * as React from "react";

interface PageShellProps extends React.ComponentProps<"main"> {
    as?: React.ElementType;
}

export function PageShell({
    className,
    as: Comp = "main",
    ...props
}: PageShellProps) {
    return (
        <Comp
            {...props}
            className={cn(
                "relative isolate z-0 mx-auto flex size-full min-h-dvh min-w-0 flex-1 flex-col overflow-x-clip leading-snug tracking-tight outline-none [-webkit-user-drag:none] focus-visible:outline-none",
                className
            )}
            id="main"
            tabIndex={-1}
        />
    );
}
