import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";

export function Separator({
    children,
    className,
    orientation = "horizontal",
    role,
    ...props
}: SeparatorPrimitive.Props) {
    const hasChildren = !!children || children === 0;

    return (
        <SeparatorPrimitive
            {...props}
            className={cn(
                hasChildren
                    ? "text-muted-foreground before:bg-border/50 after:bg-border/50 flex shrink-0 items-center gap-3 before:flex-1 before:content-[''] after:flex-1 after:content-['']"
                    : "bg-border/50 shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
                hasChildren &&
                    orientation === "horizontal" &&
                    "w-full before:h-px after:h-px",
                hasChildren &&
                    orientation === "vertical" &&
                    "h-full flex-col self-stretch before:w-px after:w-px",
                className
            )}
            data-slot="separator"
            orientation={orientation}
            role={hasChildren ? "none" : (role ?? "separator")}
        >
            {children}
        </SeparatorPrimitive>
    );
}
