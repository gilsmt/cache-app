"use client";

import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T, useGT, useMessages, Var } from "gt-next";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { useIsExtensionInstalled } from "@/components/hooks/use-extension-installed";
import {
    MarkdownImportDialog,
    openMarkdownImportDialog,
} from "@/components/integrations/markdown";
import {
    openRssManageDialog,
    RssManageDialog,
} from "@/components/integrations/rss";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CollapsibleListVertical } from "@/components/ui/collapsible-list";
import { HighlightIn } from "@/components/ui/highlight-in";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import { Kbd, KbdCombo } from "@/components/ui/kbd";
import {
    PreviewCard,
    PreviewCardDescription,
    PreviewCardPopup,
    PreviewCardTitle,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";
import { SidebarItem } from "@/components/ui/sidebar";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    executeConnectBehavior,
    executeCopyPromptBehavior,
    executeOpenBehavior,
    executeSyncBehavior,
} from "@/lib/integrations/client";
import {
    INTEGRATION_DEFINITIONS,
    type Integration,
    type IntegrationAction,
    type IntegrationActionRole,
    type IntegrationBehavior,
    type IntegrationId,
    isIntegrationActionVisible,
} from "@/lib/integrations/registry";
import { getIntegrationIcon } from "@/lib/integrations/resolver";
import IntegrationsPreviewImage from "@/public/integrations-preview.webp";

const INTEGRATIONS_LIST_OPEN_STORAGE_KEY = "cache:integrations:list-open";
const INTEGRATIONS_DISCLAIMER_VISIBLE_STORAGE_KEY =
    "cache:integrations:disclaimer-visible";

const ACTION_STATUS_DISMISS_MS = 6000;

const INTEGRATIONS_LIST_MAX_VISIBLE = 6;
const INTEGRATIONS_LIST_OVERFLOW_PREVIEW_COUNT = 3;

const NO_ACTION_FEEDBACK: IntegrationActionResult = {
    refresh: false,
    successMessage: null,
};

type IntegrationActionStatusTone = "error" | "success";

interface IntegrationActionStatus {
    message: string;
    tone: IntegrationActionStatusTone;
}

interface IntegrationActionResult {
    refresh: boolean;
    successMessage: string | null;
}

interface IntegrationActionViewModel {
    isLoading: boolean;
    label: string;
    onClick: () => void | Promise<void>;
    role: IntegrationActionRole;
}

interface UseIntegrationActionsArgs {
    integration: Integration;
    isConnected: boolean;
    isExtensionInstalled: boolean;
}

interface UseIntegrationActionsResult {
    actionStatus: IntegrationActionStatus | null;
    actions: IntegrationActionViewModel[];
}

const log = createLogger("library:integrations");

const { actions: integrationsListActions, useStore: useIntegrationsListStore } =
    createStore({
        isIntegrationsDisclaimerVisible: storage(true, {
            storageKey: INTEGRATIONS_DISCLAIMER_VISIBLE_STORAGE_KEY,
        }),
        isIntegrationsListOpen: storage(true, {
            storageKey: INTEGRATIONS_LIST_OPEN_STORAGE_KEY,
        }),
    });

export function openIntegrationsList() {
    integrationsListActions.setIsIntegrationsListOpen(true);
}

function useIntegrationActions({
    integration,
    isExtensionInstalled,
    isConnected,
}: UseIntegrationActionsArgs): UseIntegrationActionsResult {
    const gt = useGT();
    const m = useMessages();
    const router = useRouter();

    const [actionStatus, setActionStatus] =
        React.useState<IntegrationActionStatus | null>(null);
    const pendingActionRoles = useRefWithInit(
        () => new Set<IntegrationActionRole>()
    ).current;
    const [loadingRoles, setLoadingRoles] = React.useState<
        ReadonlySet<IntegrationActionRole>
    >(() => new Set());

    const statusDismissTimeout = useTimeout();

    function showActionStatus(status: IntegrationActionStatus) {
        statusDismissTimeout.start(ACTION_STATUS_DISMISS_MS, () =>
            setActionStatus(null)
        );
        setActionStatus(status);
    }

    const handleIntegrationAction = useStableCallback(
        async (action: IntegrationAction) => {
            if (pendingActionRoles.has(action.role)) {
                return;
            }
            pendingActionRoles.add(action.role);

            setActionStatus(null);
            setLoadingRoles((prev) => new Set(prev).add(action.role));

            try {
                const result = await executeIntegrationAction({
                    action,
                    gt,
                    integration,
                    isExtensionInstalled,
                    m,
                });

                if (result.refresh) {
                    router.refresh();
                }

                if (result.successMessage) {
                    showActionStatus({
                        message: result.successMessage,
                        tone: "success",
                    });
                }
            } catch (error) {
                log.error("Integration action failed", {
                    error,
                    integrationId: integration.id,
                    role: action.role,
                });

                showActionStatus({
                    message: getErrorMessage(
                        error,
                        gt("Could not complete this integration action.")
                    ),
                    tone: "error",
                });
            } finally {
                pendingActionRoles.delete(action.role);
                setLoadingRoles((prev) => {
                    const nextRoles = new Set(prev);
                    nextRoles.delete(action.role);
                    return nextRoles;
                });
            }
        }
    );

    const visibleActions: IntegrationActionViewModel[] = [];

    for (const action of integration.actions) {
        if (!isIntegrationActionVisible(action, isConnected)) {
            continue;
        }
        visibleActions.push({
            isLoading: loadingRoles.has(action.role),
            label: resolveActionLabel({
                action,
                gt,
                isConnected,
                isExtensionInstalled,
                m,
            }),
            onClick: () => handleIntegrationAction(action),
            role: action.role,
        } satisfies IntegrationActionViewModel);
    }

    return { actionStatus, actions: visibleActions };
}

function resolveActionLabel(args: {
    action: IntegrationAction;
    gt: ReturnType<typeof useGT>;
    isConnected: boolean;
    isExtensionInstalled: boolean;
    m: ReturnType<typeof useMessages>;
}) {
    const { action, gt, isConnected, isExtensionInstalled, m } = args;
    const role = action.role;

    if (action.label) {
        return m(action.label);
    }

    switch (role) {
        case "open":
            return isExtensionInstalled ? gt("Open") : gt("Get extension");
        case "connect":
            return isConnected ? gt("Reconnect") : gt("Connect");
        case "sync":
            return gt("Sync");
        case "copy":
            return gt("Copy prompt");
        case "import":
            return gt("Import");
        default:
            throw new Error(
                `Unhandled integration action role: ${role satisfies never}.`
            );
    }
}

function resolvePrimaryAction(
    actions: IntegrationActionViewModel[]
): IntegrationActionViewModel | undefined {
    return (
        actions.find((action) => action.role === "sync") ??
        actions.find((action) => action.role !== "connect") ??
        actions[0]
    );
}

async function executeIntegrationAction(args: {
    action: IntegrationAction;
    gt: ReturnType<typeof useGT>;
    integration: Integration;
    isExtensionInstalled: boolean;
    m: ReturnType<typeof useMessages>;
}): Promise<IntegrationActionResult> {
    const { action, gt, integration, isExtensionInstalled, m } = args;
    const behavior: IntegrationBehavior = action.behavior;

    switch (behavior.kind) {
        case "extension-entry":
            executeOpenBehavior(behavior, isExtensionInstalled);
            return NO_ACTION_FEEDBACK;
        case "rss-manage":
            openRssManageDialog();
            return NO_ACTION_FEEDBACK;
        case "oauth-link":
        case "social-sign-in":
            await executeConnectBehavior(behavior);
            return NO_ACTION_FEEDBACK;
        case "copy-prompt":
            await executeCopyPromptBehavior(behavior);
            return {
                refresh: false,
                successMessage: gt("Copied to clipboard."),
            };
        case "route":
        case "google-photos-picker":
            return {
                refresh: true,
                successMessage: await executeSyncBehavior(behavior, m),
            };
        case "markdown-import":
            openMarkdownImportDialog();
            return NO_ACTION_FEEDBACK;
        default:
            throw new Error(
                `Unhandled behavior for integration action ${integration.id}/${action.role}: ${behavior satisfies never}.`
            );
    }
}

interface IntegrationsProps {
    connectedIntegrations: ReadonlySet<IntegrationId>;
}

export function Integrations({ connectedIntegrations }: IntegrationsProps) {
    return (
        <IntegrationsList data-sidebar-collapsible="">
            <IntegrationsListTrigger
                connectedCount={connectedIntegrations.size}
            >
                <T>Integrations</T>
            </IntegrationsListTrigger>
            <IntegrationsListPanel>
                <IntegrationsListContent>
                    {INTEGRATION_DEFINITIONS.map((integration) => (
                        <IntegrationsListItem
                            integration={integration}
                            isConnected={connectedIntegrations.has(
                                integration.id
                            )}
                            key={integration.id}
                        />
                    ))}
                </IntegrationsListContent>
                <IntegrationsListDisclaimer />
            </IntegrationsListPanel>
            <RssManageDialog />
            <MarkdownImportDialog />
        </IntegrationsList>
    );
}

function IntegrationsList({
    className,
    ...props
}: React.ComponentProps<typeof Collapsible>) {
    const gt = useGT();
    const { isIntegrationsListOpen, setIsIntegrationsListOpen } =
        useIntegrationsListStore();

    const toggleIntegrationsList = useStableCallback(() => {
        setIsIntegrationsListOpen((prev) => !prev);
    });

    useHotkeys("mod+shift+i", toggleIntegrationsList, {
        description: gt("Toggle integrations panel"),
        preventDefault: true,
    });

    return (
        <Collapsible
            {...props}
            className={cn("group/collapsible", className)}
            onOpenChange={setIsIntegrationsListOpen}
            open={isIntegrationsListOpen}
        />
    );
}

interface IntegrationsListTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    connectedCount: number;
}

function IntegrationsListTrigger({
    children,
    connectedCount,
    render,
    ...props
}: IntegrationsListTriggerProps) {
    const gt = useGT();
    const { isIntegrationsListOpen } = useIntegrationsListStore();

    return (
        <PreviewCard>
            <PreviewCardTrigger
                render={
                    <CollapsibleTrigger
                        {...props}
                        render={
                            render ?? (
                                <SidebarItem
                                    render={<button type="button" />}
                                />
                            )
                        }
                        title={
                            isIntegrationsListOpen
                                ? gt("Collapse group")
                                : gt("Expand group")
                        }
                    />
                }
            >
                <span className="min-w-0 text-xs">{children}</span>
                <ChevronDownFilledIcon
                    aria-hidden
                    className="-ml-0.5"
                    focusable="false"
                />
                <HighlightIn className="absolute right-2 text-[11px] text-muted-foreground group-hover:hidden">
                    <T>
                        <Var>{connectedCount}</Var> connected
                    </T>
                </HighlightIn>
                <Kbd className="invisible ml-auto bg-transparent opacity-80 group-hover:visible group-focus-visible:visible group-has-data-open/collapsible:hidden">
                    <KbdCombo keys="mod+shift+i" />
                </Kbd>
            </PreviewCardTrigger>
            <PreviewCardPopup
                align="start"
                className="flex flex-col p-0"
                positionMethod="fixed"
                side="right"
            >
                <Image
                    alt=""
                    aria-hidden
                    placeholder="blur"
                    sizes="400px"
                    src={IntegrationsPreviewImage}
                />
                <div className="m-3 flex max-w-64 flex-col gap-2">
                    <PreviewCardTitle>
                        <T>Integrations</T>
                    </PreviewCardTitle>
                    <PreviewCardDescription>
                        <T>
                            Enable Cache to sync content from other platforms
                            into your library.
                        </T>
                    </PreviewCardDescription>
                </div>
            </PreviewCardPopup>
        </PreviewCard>
    );
}

function IntegrationsListPanel({
    ...props
}: React.ComponentProps<typeof CollapsiblePanel>) {
    return <CollapsiblePanel {...props} />;
}

function IntegrationsListContent({
    ...props
}: React.ComponentProps<typeof CollapsibleListVertical>) {
    return (
        <CollapsibleListVertical
            {...props}
            collapsedPreview={<IntegrationsListOverflowPreview />}
            maxVisible={INTEGRATIONS_LIST_MAX_VISIBLE}
            triggerProps={{ className: "ml-1.25" }}
        />
    );
}

function IntegrationsListOverflowPreview() {
    const previewIntegrations = INTEGRATION_DEFINITIONS.slice(
        INTEGRATIONS_LIST_MAX_VISIBLE,
        INTEGRATIONS_LIST_MAX_VISIBLE + INTEGRATIONS_LIST_OVERFLOW_PREVIEW_COUNT
    );

    if (previewIntegrations.length === 0) {
        return null;
    }

    return (
        <AvatarGroup aria-hidden="true" className="-space-x-1.5">
            {previewIntegrations.map((integration) => {
                const PreviewIcon = getIntegrationIcon(integration.id);

                return (
                    <Avatar className="size-5 rounded-md" key={integration.id}>
                        <AvatarFallback className="rounded-md bg-background ring-1 ring-border ring-inset">
                            <PreviewIcon
                                aria-hidden
                                className="size-3.5"
                                focusable="false"
                            />
                        </AvatarFallback>
                    </Avatar>
                );
            })}
        </AvatarGroup>
    );
}

interface IntegrationsListItemProps
    extends React.ComponentProps<typeof PreviewCardTrigger> {
    integration: Integration;
    isConnected: boolean;
}

function IntegrationsListItem({
    integration,
    isConnected,
    ...props
}: IntegrationsListItemProps) {
    const m = useMessages();
    const isExtensionInstalled = useIsExtensionInstalled();
    const { actionStatus, actions } = useIntegrationActions({
        integration,
        isConnected,
        isExtensionInstalled,
    });

    const primaryAction = resolvePrimaryAction(actions);
    const isAnyActionLoading = actions.some((action) => action.isLoading);
    const hasActionStatus = actionStatus !== null;
    const IntegrationIcon = getIntegrationIcon(integration.id);

    const handlePrimaryActionClick = useStableCallback(() => {
        if (isAnyActionLoading) {
            return;
        }
        primaryAction?.onClick();
    });

    return (
        <IntegrationsListItemPreviewTrigger
            {...props}
            integration={integration}
            render={<SidebarItem className="opacity-100" />}
        >
            <Avatar aria-hidden className="size-6 rounded-md">
                <AvatarFallback className="rounded-md">
                    <IntegrationIcon
                        aria-hidden
                        className="size-3.5 shrink-0"
                        focusable="false"
                    />
                </AvatarFallback>
            </Avatar>
            {primaryAction ? (
                <button
                    className="min-w-0 flex-1 cursor-pointer text-left font-medium text-sm leading-snug after:absolute after:inset-0 disabled:cursor-default"
                    disabled={isAnyActionLoading}
                    onClick={handlePrimaryActionClick}
                    type="button"
                >
                    {integration.label}
                </button>
            ) : (
                <span className="min-w-0 flex-1 font-medium text-sm leading-snug">
                    {integration.label}
                </span>
            )}
            <div className="pointer-events-none grid w-fit items-center justify-self-end text-muted-foreground leading-snug">
                <span
                    className={cn(
                        "text-right text-[11px] opacity-0 [grid-area:1/1] sm:opacity-100 sm:group-hover:opacity-0 sm:group-focus-within:opacity-0",
                        hasActionStatus && "sm:opacity-0"
                    )}
                >
                    {m(integration.description)}
                </span>
                <IntegrationsListItemActions
                    actionStatus={actionStatus}
                    actions={actions}
                />
            </div>
        </IntegrationsListItemPreviewTrigger>
    );
}

interface IntegrationsListItemPreviewTriggerProps
    extends React.ComponentProps<typeof PreviewCardTrigger> {
    integration: Integration;
}

function IntegrationsListItemPreviewTrigger({
    integration,
    ...props
}: IntegrationsListItemPreviewTriggerProps) {
    const m = useMessages();

    return (
        <PreviewCard>
            <PreviewCardTrigger {...props} />
            <PreviewCardPopup
                className="flex flex-col p-0"
                positionMethod="fixed"
                side="right"
            >
                {integration.hintImage ? (
                    <div className="relative aspect-3/2 w-full shrink-0">
                        <Image
                            alt=""
                            className="object-cover"
                            fill
                            sizes="256px"
                            src={integration.hintImage}
                        />
                    </div>
                ) : null}
                <PreviewCardDescription className="p-3">
                    {m(integration.hint)}
                </PreviewCardDescription>
            </PreviewCardPopup>
        </PreviewCard>
    );
}

interface IntegrationsListItemActionsProps {
    actionStatus: IntegrationActionStatus | null;
    actions: IntegrationActionViewModel[];
}

function IntegrationsListItemActions({
    actions,
    actionStatus,
}: IntegrationsListItemActionsProps) {
    if (!actions.length) {
        return null;
    }

    const hasActionStatus = actionStatus !== null;

    return (
        <div
            className={cn(
                "z-10 -mr-2.5 flex w-fit min-w-0 shrink-0 items-center justify-end justify-self-end [grid-area:1/1]",
                hasActionStatus
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-auto opacity-100 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
            )}
        >
            <IntegrationsListActionStatus tone={actionStatus?.tone}>
                {actionStatus?.message}
            </IntegrationsListActionStatus>
            {actions.map((action) => (
                <IntegrationsListItemActionButton
                    action={action}
                    key={action.role}
                />
            ))}
        </div>
    );
}

interface IntegrationsListActionStatusProps extends React.ComponentProps<"p"> {
    tone?: IntegrationActionStatusTone;
}

function IntegrationsListActionStatus({
    tone = "success",
    className,
    ...props
}: IntegrationsListActionStatusProps) {
    const isError = tone === "error";

    return (
        <p
            {...props}
            aria-atomic="true"
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
                "pointer-events-none max-w-full text-right text-xs leading-tight empty:hidden",
                isError ? "text-destructive" : "text-muted-foreground",
                className
            )}
            role={isError ? "alert" : "status"}
        />
    );
}

interface IntegrationsListItemActionButtonProps {
    action: IntegrationActionViewModel;
}

function IntegrationsListItemActionButton({
    action,
}: IntegrationsListItemActionButtonProps) {
    const handleClick = useStableCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        action.onClick();
    });

    return (
        <Button
            className="rounded-full text-xs!"
            isLoading={action.isLoading}
            onClick={handleClick}
            size="sm"
            variant="ghost"
        >
            {action.label}
        </Button>
    );
}

function IntegrationsListDisclaimer() {
    const {
        isIntegrationsDisclaimerVisible,
        setIsIntegrationsDisclaimerVisible,
    } = useIntegrationsListStore();

    const handleDismiss = useStableCallback(() =>
        setIsIntegrationsDisclaimerVisible(false)
    );

    return (
        <Collapsible
            className="mx-2.5 pb-1"
            onOpenChange={setIsIntegrationsDisclaimerVisible}
            open={isIntegrationsDisclaimerVisible}
        >
            <CollapsiblePanel>
                <p className="text-[11px] text-muted-foreground leading-tight">
                    <T>
                        Only connect accounts you trust. Cache can access what
                        you choose to save with connected apps. You can always
                        change your mind.
                    </T>{" "}
                    <Button
                        className="h-fit! px-0 leading-tight sm:text-[11px]"
                        onClick={handleDismiss}
                        size="xs"
                        variant="link"
                    >
                        <T>Dismiss</T>
                    </Button>{" "}
                    <T>or</T>{" "}
                    <Button
                        className="h-fit! px-0 leading-tight sm:text-[11px]"
                        nativeButton={false}
                        render={
                            <Link
                                href="/legal/privacy-policy"
                                prefetch={false}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                        size="xs"
                        variant="link"
                    >
                        <T>Cache Privacy</T>
                        <ArrowUpRight className="inline-block size-3 shrink-0 text-muted-foreground" />
                    </Button>
                </p>
            </CollapsiblePanel>
        </Collapsible>
    );
}
