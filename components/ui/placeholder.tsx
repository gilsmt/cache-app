import { cn } from "cn";
import { GlobeX } from "lucide-react";
import * as React from "react";
import { djb2Hash } from "@/lib/common/hash";

interface PlaceholderStyle extends React.CSSProperties {
    "--texture-position": string;
}

export function Placeholder({
    className,
    children,
    style,
    ...props
}: React.ComponentProps<"div">) {
    const id = React.useId();

    const hash = djb2Hash(id);
    const x = hash % 101; // x in [0, 100] percent
    const y = (hash >> 8) % 101; // y in [0, 100] percent
    const textureStyle: PlaceholderStyle = {
        "--texture-position": `${x}% ${y}%`,
    };

    return (
        <div
            {...props}
            className={cn(
                "texture-screen relative flex size-full flex-col items-center justify-center gap-2 bg-muted/80",
                className
            )}
            style={{ ...textureStyle, ...style }}
        >
            {children ?? (
                <GlobeX className="size-6 text-muted-foreground opacity-50" />
            )}
        </div>
    );
}
