"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { LocaleSelector, T, useGT, Var } from "gt-next";
import {
    ArrowUpRight,
    ChevronDown,
    Download,
    Ellipsis,
    LoaderCircle,
    Megaphone,
    UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";
import { DeleteAccountDialogTrigger } from "@/components/auth/delete-account-dialog-trigger";
import { LogOutDialogTrigger } from "@/components/auth/logout-dialog-trigger";
import { WithUserSessionOnly } from "@/components/auth/session";
import {
    SubscribedOnly,
    SubscriptionLoadingOnly,
    SubscriptionStatusBadge,
    UnsubscribedOnly,
    useSubscriptionBillingPortalAction,
    useSubscriptionUpgradeAction,
} from "@/components/billing/subscription";
import { FeedbackWidget } from "@/components/support/feedback-widget";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { AltKbd, CmdKbd, Kbd } from "@/components/ui/kbd";
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuPopup,
    MenuRadioGroup,
    MenuRadioItem,
    MenuSeparator,
    MenuSub,
    MenuSubPopup,
    MenuSubTrigger,
    MenuTrigger,
} from "@/components/ui/menu";
import { KeyboardShortcutsDialogTrigger } from "@/components/ui/shortcuts";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSelector } from "@/components/ui/theme";
import { authClient, useSession } from "@/lib/auth/client";
import type { Session } from "@/lib/auth/session";
import {
    ACTION_STATUS,
    CHANGELOG_URL,
    GITHUB_URL,
    SUPPORT_URL,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { getInitials } from "@/lib/common/string";
import { getDesktopDownloads } from "@/lib/desktop/actions";
import { DESKTOP_ASSETS } from "@/lib/desktop/constants";
import { detectDesktopPlatform } from "@/lib/desktop/platform";
import {
    type DesktopDownload,
    getDesktopReleasesPageUrl,
    getStaticDesktopDownloads,
} from "@/lib/desktop/releases";

const DEVICE_SESSIONS_SWR_KEY = ["auth-user-menu:device-sessions"] as const;
const DESKTOP_DOWNLOADS_SWR_KEY = ["desktop:downloads"] as const;

type AccountMenuError = "add" | "load" | "switch";

type AccountUser = NonNullable<Session>["user"];

interface DeviceSession {
    session: {
        token: string;
    };
    user: AccountUser;
}

const log = createLogger("auth-user-menu");

function useUserMenuAccounts() {
    const router = useRouter();
    const { data: activeSession, refetch } = useSession();

    const [, startAccountChangeTransition] = React.useTransition();
    const [isAddingAccount, startAddAccountTransition] = React.useTransition();
    const [pendingSessionToken, setPendingSessionToken] = React.useState<
        null | string
    >(null);

    const [switchAccountError, setSwitchAccountError] =
        React.useState<unknown>(null);
    const [addAccountError, setAddAccountError] = React.useState<unknown>(null);

    const {
        data: deviceSessions = [],
        error: deviceSessionsError,
        isLoading: isLoadingDeviceSessions,
        mutate: refreshDeviceSessions,
    } = useSWR(
        activeSession ? DEVICE_SESSIONS_SWR_KEY : null,
        listDeviceSessions
    );

    const handleAccountChange = useStableCallback((sessionToken: string) => {
        if (
            !activeSession ||
            pendingSessionToken !== null ||
            sessionToken === activeSession.session.token
        ) {
            return;
        }

        setPendingSessionToken(sessionToken);
        setSwitchAccountError(null);

        startAccountChangeTransition(async () => {
            try {
                const result = await authClient.multiSession.setActive({
                    sessionToken,
                });

                if (result.error) {
                    log.error("Failed to switch active session", result.error);
                    setSwitchAccountError(result.error);
                    return;
                }

                await Promise.all([refetch(), refreshDeviceSessions()]);
                router.refresh();
            } catch (error) {
                log.error("Failed to switch active session", error);
                setSwitchAccountError(error);
            } finally {
                setPendingSessionToken(null);
            }
        });
    });

    const handleAddAccount = useStableCallback(() => {
        setAddAccountError(null);

        startAddAccountTransition(async () => {
            try {
                const result = await authClient.signIn.social({
                    callbackURL: "/library",
                    errorCallbackURL: "/library",
                    provider: "google",
                });

                if (result.error) {
                    log.error("Failed to add account session", result.error);
                    setAddAccountError(result.error);
                }
            } catch (error) {
                log.error("Failed to add account session", error);
                setAddAccountError(error);
            }
        });
    });

    const accountMenuError = getAccountMenuError(
        addAccountError,
        deviceSessionsError
    );

    const accountOptions = activeSession
        ? getAccountOptions(deviceSessions, activeSession)
        : [];

    return {
        accountMenuError,
        accountOptions,
        activeSession,
        handleAccountChange,
        handleAddAccount,
        isAddingAccount,
        isLoadingDeviceSessions,
        pendingSessionToken,
        switchAccountError,
    };
}

function getAccountOptions(
    deviceSessions: DeviceSession[],
    activeSession: Session
): DeviceSession[] {
    const hasActiveSession = deviceSessions.some(
        (deviceSession) =>
            deviceSession.session.token === activeSession.session.token
    );

    if (hasActiveSession) {
        return deviceSessions;
    }

    return [
        {
            session: {
                token: activeSession.session.token,
            },
            user: activeSession.user,
        },
        ...deviceSessions,
    ];
}

async function listDeviceSessions(): Promise<DeviceSession[]> {
    const result = await authClient.multiSession.listDeviceSessions();
    if (result.error) {
        log.error("Failed to load device sessions", result.error);
        throw new Error("Failed to load device sessions.");
    }
    return result.data ?? [];
}

function getAccountMenuError(
    addAccountError: unknown,
    deviceSessionsError: unknown
): AccountMenuError | null {
    if (addAccountError) {
        return "add";
    }
    if (deviceSessionsError) {
        return "load";
    }
    return null;
}

async function fetchDesktopDownloads(): Promise<{
    downloads: DesktopDownload[];
    version?: string;
}> {
    try {
        const result = await getDesktopDownloads();

        if (result.status === ACTION_STATUS.SUCCESS) {
            return {
                downloads: result.data.downloads,
                version: result.data.version,
            };
        }
    } catch (error) {
        log.warn("Desktop downloads action failed; using static URLs", error);
    }

    return { downloads: getStaticDesktopDownloads() };
}

export function UserMenu(
    props: Omit<React.ComponentProps<typeof Menu>, "open" | "onOpenChange">
) {
    const [isOpen, setIsOpen] = React.useState(false);

    const toggle = useStableCallback(() => {
        setIsOpen((prev) => !prev);
    });

    useHotkeys("mod+alt+g", toggle, {
        description: "Open account menu",
        preventDefault: true,
    });

    return <Menu {...props} onOpenChange={setIsOpen} open={isOpen} />;
}

export function UserMenuTrigger(
    props: React.ComponentProps<typeof MenuTrigger>
) {
    const gt = useGT();

    return (
        <MenuTrigger
            {...props}
            aria-label={props["aria-label"] ?? gt("Open account menu")}
            openOnHover
        >
            <WithUserSessionOnly fallback={<UserMenuTriggerSkeleton />}>
                {(user) => (
                    <span className="flex min-w-0 items-center gap-2">
                        <Avatar className="size-5.5 rounded-md">
                            <AvatarImage
                                alt={user.name ?? user.email}
                                loading="lazy"
                                src={user.image ?? undefined}
                            />
                            <AvatarFallback className="rounded-md text-xs">
                                {getInitials(user.name, user.email)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 max-w-full truncate text-left font-medium text-sm">
                            {user.name ?? <T>Account</T>}
                        </span>
                    </span>
                )}
            </WithUserSessionOnly>
            <ChevronDown
                aria-hidden
                className="pointer-events-none invisible inline-block size-4 shrink-0 text-muted-foreground opacity-80 group-hover:visible group-focus-visible:visible group-data-popup-open:visible group-data-popup-open:opacity-30"
                focusable="false"
            />
            <Kbd
                className="invisible ml-auto bg-transparent opacity-80 group-hover:visible group-focus-visible:visible group-data-popup-open:visible"
                data-sidebar-label=""
            >
                <CmdKbd />
                <AltKbd />G
            </Kbd>
        </MenuTrigger>
    );
}

export function UserMenuPopup({
    children,
    align = "start",
    className,
    side = "top",
    ...props
}: React.ComponentProps<typeof MenuPopup>) {
    return (
        <MenuPopup
            {...props}
            align={align}
            className={cn("min-w-62", className)}
            side={side}
        >
            <div className="flex flex-col gap-1">{children}</div>
        </MenuPopup>
    );
}

export function UserMenuHeader() {
    return (
        <WithUserSessionOnly>
            {(user) => (
                <div className="w-full min-w-0 flex-1 pb-1">
                    <UserMenuAccountSwitcherSubMenu className="gap-5 rounded-xl">
                        <div className="min-w-0">
                            <span className="block truncate font-medium text-sm">
                                {user.name ?? <T>Cache account</T>}
                            </span>
                            <span className="block truncate text-muted-foreground text-xs">
                                {user.email}
                            </span>
                        </div>
                    </UserMenuAccountSwitcherSubMenu>
                    <div className="flex items-center px-2 py-1">
                        <SubscriptionStatusBadge />
                    </div>
                </div>
            )}
        </WithUserSessionOnly>
    );
}

export function UserMenuContent() {
    return (
        <>
            <FeedbackWidget
                context="user-menu"
                nativeButton={false}
                render={<MenuItem closeOnClick={false} />}
            >
                Send feedback
                <Megaphone className="ml-auto inline-block size-4 text-muted-foreground" />
            </FeedbackWidget>
            <MenuSeparator />
            <MenuGroup>
                <div className="flex items-center justify-between pr-2 pl-2.5">
                    <span className="font-normal text-foreground text-sm">
                        <T>Theme</T>
                    </span>
                    <ThemeSelector />
                </div>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
                <SubscriptionLoadingOnly>
                    <MenuItem disabled>
                        <Skeleton className="h-5 w-24" />
                        <ArrowUpRight className="ml-auto! inline-block size-3.5 text-muted-foreground/50" />
                    </MenuItem>
                </SubscriptionLoadingOnly>
                <SubscribedOnly>
                    <UserMenuBillingItem />
                </SubscribedOnly>
                <UnsubscribedOnly>
                    <UserMenuUpgradeItem />
                </UnsubscribedOnly>
                <UserMenuDesktopDownloadSubMenu />
                <LogOutDialogTrigger
                    nativeButton={false}
                    render={
                        <MenuItem
                            className="justify-between"
                            closeOnClick={false}
                        />
                    }
                >
                    <T context="User Log out/Sign out of the app">Log out</T>
                </LogOutDialogTrigger>
            </MenuGroup>
        </>
    );
}

export function UserMenuFooter() {
    return (
        <>
            <MenuSeparator />
            <div className="flex w-full items-center px-1.5 py-1">
                <LocaleSelector
                    className="w-full font-normal text-sm opacity-50"
                    id="language-selector"
                    name="language"
                />
            </div>
            <div className="flex flex-wrap items-center px-0.5 py-1 opacity-50">
                <Button
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
                    variant="ghost"
                >
                    <T>Privacy</T>
                </Button>
                <Button
                    nativeButton={false}
                    render={
                        <Link
                            href="/legal/terms-of-service"
                            prefetch={false}
                            rel="noopener noreferrer"
                            target="_blank"
                        />
                    }
                    size="xs"
                    variant="ghost"
                >
                    <T>Terms</T>
                </Button>
                <Button
                    nativeButton={false}
                    render={
                        <Link
                            href="/security"
                            prefetch={false}
                            rel="noopener noreferrer"
                            target="_blank"
                        />
                    }
                    size="xs"
                    variant="ghost"
                >
                    <T>Security</T>
                </Button>
                <UserMenuAccountActionsSubMenu className="ml-auto">
                    <Ellipsis
                        aria-hidden
                        className="inline-block size-3.5 shrink-0"
                        focusable="false"
                    />
                </UserMenuAccountActionsSubMenu>
            </div>
        </>
    );
}

function UserMenuTriggerSkeleton() {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-5.5 rounded-md" />
            <Skeleton className="h-4 w-16" />
        </span>
    );
}

function UserMenuAccountSwitcherSubMenu(
    props: React.ComponentProps<typeof MenuSubTrigger>
) {
    return (
        <MenuSub>
            <MenuSubTrigger {...props} />
            <MenuSubPopup align="end">
                <MenuGroup>
                    <MenuGroupLabel>
                        <T>Your accounts</T>
                    </MenuGroupLabel>
                    <UserMenuAccountSwitcherContent />
                </MenuGroup>
            </MenuSubPopup>
        </MenuSub>
    );
}

function UserMenuAccountSwitcherContent() {
    const {
        accountMenuError,
        accountOptions,
        activeSession,
        handleAccountChange,
        handleAddAccount,
        isAddingAccount,
        isLoadingDeviceSessions,
        pendingSessionToken,
        switchAccountError,
    } = useUserMenuAccounts();

    if (!activeSession) {
        return null;
    }

    if (isLoadingDeviceSessions) {
        return (
            <MenuItem disabled>
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                <T>Loading accounts</T>
            </MenuItem>
        );
    }

    if (accountMenuError) {
        return (
            <MenuItem disabled>
                <AccountMenuErrorMessage error={accountMenuError} />
            </MenuItem>
        );
    }

    return (
        <>
            <MenuRadioGroup
                disabled={!!pendingSessionToken}
                onValueChange={handleAccountChange}
                value={activeSession.session.token}
            >
                {accountOptions.map((deviceSession) => {
                    const accountLabel =
                        deviceSession.user.name ?? deviceSession.user.email;
                    const isPendingSession =
                        pendingSessionToken === deviceSession.session.token;

                    return (
                        <MenuRadioItem
                            closeOnClick={false}
                            key={deviceSession.user.id}
                            label={accountLabel}
                            value={deviceSession.session.token}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar className="size-5.5 rounded-md">
                                    <AvatarImage
                                        alt={
                                            deviceSession.user.name ??
                                            deviceSession.user.email
                                        }
                                        loading="lazy"
                                        src={
                                            deviceSession.user.image ??
                                            undefined
                                        }
                                    />
                                    <AvatarFallback className="rounded-md text-xs">
                                        {getInitials(
                                            deviceSession.user.name,
                                            deviceSession.user.email
                                        )}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">
                                        {deviceSession.user.name ?? (
                                            <T>Cache account</T>
                                        )}
                                    </span>
                                    <span className="block truncate text-muted-foreground text-xs">
                                        {deviceSession.user.email}
                                    </span>
                                </span>
                                {isPendingSession ? (
                                    <LoaderCircle className="ml-auto size-4 animate-spin text-muted-foreground" />
                                ) : null}
                            </span>
                        </MenuRadioItem>
                    );
                })}
            </MenuRadioGroup>
            {switchAccountError ? (
                <MenuItem disabled>
                    <AccountMenuErrorMessage error="switch" />
                </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem
                closeOnClick={false}
                disabled={isAddingAccount}
                onClick={handleAddAccount}
            >
                {isAddingAccount ? (
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                ) : (
                    <UserRoundPlus className="size-4 text-muted-foreground" />
                )}
                <T>Add another account...</T>
            </MenuItem>
        </>
    );
}

function AccountMenuErrorMessage({ error }: { error: AccountMenuError }) {
    switch (error) {
        case "add":
            return <T>Could not add another account.</T>;
        case "load":
            return <T>Could not load saved accounts.</T>;
        case "switch":
            return <T>Could not switch accounts.</T>;
        default:
            return null;
    }
}

function UserMenuDesktopDownloadSubMenu() {
    const recommendedPlatform = detectDesktopPlatform();
    const { data } = useSWR(DESKTOP_DOWNLOADS_SWR_KEY, fetchDesktopDownloads, {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });

    const downloads = data?.downloads ?? getStaticDesktopDownloads();
    const versionLabel = data?.version;

    return (
        <MenuSub>
            <MenuSubTrigger>
                <T>Download desktop app</T>
            </MenuSubTrigger>
            <MenuSubPopup align="end" className="min-w-50">
                <MenuGroup>
                    {versionLabel ? (
                        <MenuGroupLabel>
                            <T>
                                Version <Var>{versionLabel}</Var>
                            </T>
                        </MenuGroupLabel>
                    ) : null}
                    {downloads.map((download) => (
                        <DesktopDownloadMenuItem
                            download={download}
                            isRecommended={
                                download.platform === recommendedPlatform
                            }
                            key={download.platform}
                        />
                    ))}
                    <MenuSeparator />
                    <MenuItem
                        className="justify-between"
                        render={
                            <a
                                href={getDesktopReleasesPageUrl()}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                    >
                        <T>All releases</T>
                        <ArrowUpRight className="ml-auto inline-block size-4 text-muted-foreground" />
                    </MenuItem>
                </MenuGroup>
            </MenuSubPopup>
        </MenuSub>
    );
}

interface DesktopDownloadMenuItemProps {
    download: DesktopDownload;
    isRecommended: boolean;
}

function DesktopDownloadMenuItem({
    download,
    isRecommended,
}: DesktopDownloadMenuItemProps) {
    return (
        <MenuItem
            className="justify-between"
            render={
                <a
                    download={download.fileName}
                    href={download.url}
                    rel="noopener noreferrer"
                    target="_blank"
                />
            }
        >
            <span className="flex min-w-0 items-center gap-2">
                <span>{DESKTOP_ASSETS[download.platform].label}</span>
                {isRecommended ? (
                    <span className="text-muted-foreground text-xs">
                        <T>Recommended</T>
                    </span>
                ) : null}
            </span>
            <Download className="ml-auto inline-block size-3.5 text-muted-foreground" />
        </MenuItem>
    );
}

function UserMenuAccountActionsSubMenu(
    props: React.ComponentProps<typeof MenuSubTrigger>
) {
    const gt = useGT();
    const label = gt("Account actions");

    return (
        <MenuSub>
            <MenuSubTrigger
                {...props}
                aria-label={label}
                nativeButton
                render={<Button size="xs" variant="ghost" />}
                title={label}
            />
            <MenuSubPopup align="end">
                <MenuGroup>
                    <MenuItem
                        className="justify-between"
                        render={
                            <Link
                                href={CHANGELOG_URL}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                    >
                        <T>Changelog</T>
                        <ArrowUpRight className="ml-auto! inline-block size-3.5 text-muted-foreground" />
                    </MenuItem>
                    <MenuItem
                        className="justify-between"
                        render={
                            <Link
                                href={SUPPORT_URL}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                    >
                        <T>Support</T>
                        <ArrowUpRight className="ml-auto! inline-block size-3.5 text-muted-foreground" />
                    </MenuItem>
                    <MenuItem
                        className="justify-between"
                        render={
                            <Link
                                href={GITHUB_URL}
                                rel="noopener noreferrer"
                                target="_blank"
                            />
                        }
                    >
                        <T>GitHub</T>
                        <ArrowUpRight className="ml-auto! inline-block size-3.5 text-muted-foreground" />
                    </MenuItem>
                    <KeyboardShortcutsDialogTrigger
                        nativeButton={false}
                        render={
                            <MenuItem
                                className="justify-between"
                                closeOnClick={false}
                            >
                                <T>Keyboard shortcuts</T>
                                <Kbd className="ml-auto inline-flex items-center gap-1 bg-transparent px-0">
                                    <CmdKbd />/
                                </Kbd>
                            </MenuItem>
                        }
                    />
                    <MenuSeparator />
                    <DeleteAccountDialogTrigger
                        nativeButton={false}
                        render={
                            <MenuItem
                                closeOnClick={false}
                                nativeButton={false}
                                variant="destructive"
                            />
                        }
                    >
                        <T context="Delete account menu item">Delete account</T>
                    </DeleteAccountDialogTrigger>
                </MenuGroup>
            </MenuSubPopup>
        </MenuSub>
    );
}

function UserMenuBillingItem() {
    const { errorMessage, execute, isPending } =
        useSubscriptionBillingPortalAction();

    return (
        <>
            <MenuItem
                closeOnClick={false}
                disabled={isPending}
                onClick={execute}
            >
                <T>Billing</T>
                {isPending ? (
                    <LoaderCircle className="ml-auto size-4 animate-spin text-muted-foreground" />
                ) : (
                    <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                )}
            </MenuItem>
            <ErrorMessage className="px-2">{errorMessage}</ErrorMessage>
        </>
    );
}

function UserMenuUpgradeItem() {
    const { errorMessage, execute, isPending } = useSubscriptionUpgradeAction();

    return (
        <>
            <MenuItem
                closeOnClick={false}
                disabled={isPending}
                onClick={execute}
            >
                <T>Upgrade to Pro</T>
                {isPending ? (
                    <LoaderCircle className="ml-auto size-4 animate-spin text-muted-foreground" />
                ) : (
                    <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                )}
            </MenuItem>
            <ErrorMessage className="px-2">{errorMessage}</ErrorMessage>
        </>
    );
}
