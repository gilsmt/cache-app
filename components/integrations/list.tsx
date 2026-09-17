"use client";

import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import {
    MarkdownImportDialog,
    openMarkdownImportDialog,
} from "@/components/integrations/markdown";
import {
    openRssManageDialog,
    RssManageDialog,
} from "@/components/integrations/rss";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CollapsibleListVertical } from "@/components/ui/collapsible-list";
import { HighlightIn } from "@/components/ui/highlight-in";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import { CmdKbd, Kbd } from "@/components/ui/kbd";
import {
    PreviewCard,
    PreviewCardPopup,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";
import { SidebarItem } from "@/components/ui/sidebar";
import { useIsExtensionInstalled } from "@/hooks/use-extension-installed";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    executeConnectBehavior,
    executeCopyPromptBehavior,
    executeOpenBehavior,
    executeSyncBehavior,
} from "@/lib/integrations/client";
import { IntegrationUserError } from "@/lib/integrations/error";
import {
    INTEGRATIONS,
    type IntegrationActionRole,
    type IntegrationDirection,
    type IntegrationId,
    listIntegrationActions,
    type SupportedIntegration,
    type SupportedIntegrationAction,
} from "@/lib/integrations/support";
import IntegrationsPreviewImage from "@/public/integrations-preview.webp";

const INTEGRATIONS_LIST_OPEN_STORAGE_KEY = "cache:integrations:list-open";
const INTEGRATIONS_DISCLAIMER_VISIBLE_STORAGE_KEY =
    "cache:integrations:disclaimer-visible";

const ACTION_STATUS_DISMISS_MS = 6000;

const INTEGRATIONS_LIST_MAX_VISIBLE = 6;

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
    direction: IntegrationDirection;
    integration: SupportedIntegration;
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
    direction,
    integration,
    isExtensionInstalled,
    isConnected,
}: UseIntegrationActionsArgs): UseIntegrationActionsResult {
    const gt = useGT();
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
        async (role: IntegrationActionRole) => {
            if (pendingActionRoles.has(role)) {
                return;
            }
            pendingActionRoles.add(role);

            setActionStatus(null);
            setLoadingRoles((prev) => new Set(prev).add(role));

            try {
                const result = await executeIntegrationAction({
                    gt,
                    integration,
                    isExtensionInstalled,
                    role,
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
                    direction,
                    error,
                    integrationId: integration.id,
                    role,
                });

                showActionStatus({
                    message: getErrorMessage(
                        error,
                        gt("Could not complete this integration action.")
                    ),
                    tone: "error",
                });
            } finally {
                pendingActionRoles.delete(role);
                setLoadingRoles((prev) => {
                    const nextRoles = new Set(prev);
                    nextRoles.delete(role);
                    return nextRoles;
                });
            }
        }
    );

    const integrationActions = listIntegrationActions(
        integration.id,
        direction
    );
    const visibleActions: IntegrationActionViewModel[] = [];

    for (const action of integrationActions) {
        if (!isActionVisible(action, isConnected)) {
            continue;
        }
        visibleActions.push({
            isLoading: loadingRoles.has(action.role),
            label: resolveActionLabel({
                gt,
                integration,
                isConnected,
                isExtensionInstalled,
                label: action.label,
                role: action.role,
            }),
            onClick: () => handleIntegrationAction(action.role),
            role: action.role,
        } satisfies IntegrationActionViewModel);
    }

    return { actionStatus, actions: visibleActions };
}

function resolveActionLabel(args: {
    gt: ReturnType<typeof useGT>;
    integration: SupportedIntegration;
    label?: string;
    isExtensionInstalled: boolean;
    isConnected: boolean;
    role: IntegrationActionRole;
}) {
    const { gt, integration, isConnected, isExtensionInstalled, label, role } =
        args;

    if (label) {
        return label;
    }

    switch (role) {
        case "open":
            if (!isExtensionInstalled && integration.behaviors.open) {
                return gt("Get extension");
            }
            return gt("Open");
        case "connect":
            return isConnected ? gt("Reconnect") : gt("Connect");
        case "sync":
            return gt("Sync");
        case "copy":
            return gt("Copy prompt");
        case "import":
            return gt("Import");
        default:
            return ((_: never) => _)(role);
    }
}

function resolveCapabilityMissingMessage(
    gt: ReturnType<typeof useGT>,
    role: IntegrationActionRole
): string {
    switch (role) {
        case "connect":
            return gt("This integration cannot be connected yet.");
        case "copy":
            return gt("This integration does not support copying a prompt.");
        case "import":
            return gt("This integration cannot be imported yet.");
        case "open":
            return gt("This integration cannot be opened yet.");
        case "sync":
            return gt("This integration cannot sync yet.");
        default:
            return ((_: never) => _)(role);
    }
}

function isActionVisible(
    action: SupportedIntegrationAction,
    isConnected: boolean
): boolean {
    if (action.visibleWhen === "connected") {
        return isConnected;
    }
    if (action.visibleWhen === "disconnected") {
        return !isConnected;
    }
    return true;
}

function buildCapabilityMissingError({
    capability,
    integrationId,
    message,
}: {
    capability: IntegrationActionRole;
    integrationId: IntegrationId;
    message: string;
}): IntegrationUserError {
    return new IntegrationUserError({
        capability,
        integrationId,
        message,
        operation: "executeIntegrationAction",
    });
}

async function executeIntegrationAction(args: {
    gt: ReturnType<typeof useGT>;
    isExtensionInstalled: boolean;
    integration: SupportedIntegration;
    role: IntegrationActionRole;
}): Promise<IntegrationActionResult> {
    const { gt, isExtensionInstalled, integration, role } = args;
    const behavior = integration.behaviors[role];

    if (!behavior) {
        throw buildCapabilityMissingError({
            capability: role,
            integrationId: integration.id,
            message: resolveCapabilityMissingMessage(gt, role),
        });
    }

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
                successMessage: await executeSyncBehavior(behavior),
            };
        case "markdown-import":
            openMarkdownImportDialog();
            return NO_ACTION_FEEDBACK;
        default:
            return ((_: never) => _)(behavior);
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
                    {INTEGRATIONS.map((integration) => (
                        <IntegrationsListItem
                            direction={
                                integration.source ? "source" : "destination"
                            }
                            integration={integration}
                            isConnected={connectedIntegrations.has(
                                integration.id
                            )}
                            key={integration.id}
                        />
                    ))}
                </IntegrationsListContent>
                <IntegrationsListDisclaimer />
                <RssManageDialog />
                <MarkdownImportDialog />
            </IntegrationsListPanel>
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

    useHotkeys("mod+i", toggleIntegrationsList, {
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
                    <CmdKbd />I
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
                    priority
                    sizes="400px"
                    src={IntegrationsPreviewImage}
                />
                <div className="m-3 flex max-w-64 flex-col gap-2">
                    <h2 className="font-medium text-sm">
                        <T>Import from other apps</T>
                    </h2>
                    <p className="text-foreground text-xs">
                        <T>Sync content from other apps into your library.</T>
                    </p>
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
    maxVisible = INTEGRATIONS_LIST_MAX_VISIBLE,
    triggerProps,
    ...props
}: React.ComponentProps<typeof CollapsibleListVertical>) {
    return (
        <CollapsibleListVertical
            {...props}
            maxVisible={maxVisible}
            triggerProps={{
                ...triggerProps,
                className: cn("ml-1.25", triggerProps?.className),
            }}
        />
    );
}

interface IntegrationsListItemProps
    extends React.ComponentProps<typeof PreviewCardTrigger> {
    direction: IntegrationDirection;
    integration: SupportedIntegration;
    isConnected: boolean;
}

function IntegrationsListItem({
    direction,
    integration,
    isConnected,
    ...props
}: IntegrationsListItemProps) {
    const isExtensionInstalled = useIsExtensionInstalled();
    const { actionStatus, actions } = useIntegrationActions({
        direction,
        integration,
        isConnected,
        isExtensionInstalled,
    });
    const [primaryAction] = actions;
    const isPrimaryActionLoading = primaryAction?.isLoading ?? false;
    const hasActionStatus = actionStatus !== null;
    const IntegrationIcon = integration.Icon;

    const handleClick = useStableCallback(() => {
        if (isPrimaryActionLoading) {
            return;
        }
        primaryAction?.onClick();
    });

    return (
        <IntegrationsListItemPreviewTrigger
            {...props}
            integration={integration}
            onClick={handleClick}
            render={
                <SidebarItem
                    aria-disabled={isPrimaryActionLoading}
                    className="opacity-100"
                    role={primaryAction ? "button" : undefined}
                    tabIndex={primaryAction ? 0 : undefined}
                />
            }
        >
            <Avatar
                aria-label={integration.label}
                className="size-6 rounded-md"
            >
                <AvatarFallback className="rounded-md">
                    <IntegrationIcon
                        aria-hidden
                        className="size-3.5 shrink-0"
                        focusable="false"
                    />
                </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 font-medium text-sm leading-snug">
                {integration.label}
            </span>
            <div className="pointer-events-none grid w-fit items-center justify-self-end text-muted-foreground leading-snug">
                <span
                    className={cn(
                        "text-right text-[11px] opacity-0 [grid-area:1/1] sm:opacity-100 sm:group-hover:opacity-0 sm:group-focus-within:opacity-0",
                        hasActionStatus && "sm:opacity-0"
                    )}
                >
                    {integration.description}
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
    integration: SupportedIntegration;
}

function IntegrationsListItemPreviewTrigger({
    integration,
    ...props
}: IntegrationsListItemPreviewTriggerProps) {
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
                <p className="p-3 text-xs leading-tight">{integration.hint}</p>
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
