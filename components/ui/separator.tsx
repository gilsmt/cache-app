import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";

export function Separator({
    className,
    orientation = "horizontal",
    ...props
}: SeparatorPrimitive.Props) {
    return (
        <SeparatorPrimitive
            {...props}
            className={cn(
                "bg-border/50 shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
                className
            )}
            data-slot="separator"
            orientation={orientation}
        />
    );
}
