"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "cn";
import type * as React from "react";

interface TextareaProps extends React.ComponentProps<"textarea"> {
    isUnstyled?: boolean;
    size?: "sm" | "default" | "lg";
    textareaClassName?: string;
}

export function Textarea({
    className,
    size = "default",
    isUnstyled = false,
    textareaClassName,
    ref,
    ...props
}: TextareaProps) {
    return (
        <span
            className={cn(
                !isUnstyled &&
                    "squircle border-input bg-background ring-ring/24 has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring dark:bg-input/32 dark:has-aria-invalid:ring-destructive/24 relative inline-grid w-full rounded-lg border text-base shadow-xs/5 transition-shadow not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-lg not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:ring-[3px] has-disabled:opacity-64 has-[:disabled,:focus-visible,[aria-invalid]]:shadow-none sm:text-sm dark:not-has-disabled:not-has-focus-visible:not-has-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                className
            )}
            data-size={size}
            data-slot="textarea-control"
        >
            <FieldPrimitive.Control
                aria-multiline="true"
                defaultValue={props.defaultValue}
                disabled={props.disabled}
                id={props.id}
                name={props.name}
                ref={ref}
                // biome-ignore lint/performance/noJsxPropsBind: React Compiler memoizes inline render props automatically
                render={(defaultProps: React.ComponentProps<"textarea">) => (
                    <textarea
                        {...mergeProps(defaultProps, props)}
                        className={cn(
                            "text-foreground placeholder:text-muted-foreground/72 field-sizing-content min-h-17.5 w-full resize-none rounded-[inherit] px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] outline-none max-sm:min-h-20.5",
                            size === "sm" &&
                                "min-h-14.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1.5)-1px)] max-sm:min-h-16.5",
                            size === "lg" &&
                                "min-h-18.5 py-[calc(--spacing(2)-1px)] max-sm:min-h-21.5",
                            textareaClassName
                        )}
                        data-slot="textarea"
                    />
                )}
                spellCheck="true"
                translate="no"
                value={props.value}
            />
        </span>
    );
}
