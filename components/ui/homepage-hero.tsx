"use client";

import { cn } from "cn";
import { msg, useMessages } from "gt-next";
import {
    Archive,
    ArrowUpRight,
    ClockFading,
    Compass,
    Ellipsis,
    FolderOpen,
    Funnel,
    GlobeX,
    Grid2x2,
    Layers3,
    ListFilter,
    MapPin,
    Play,
    Plus,
    SignalHigh,
    SignalMedium,
    Sparkle,
    Sparkles,
    SquarePen,
    Squircle,
    SquircleDashed,
    Star,
} from "lucide-react";
import {
    AnimatePresence,
    motion,
    useAnimationControls,
    useReducedMotion,
    type Variants,
} from "motion/react";
import Image from "next/image";
import * as React from "react";
import {
    Carousel,
    CarouselActiveSlide,
    CarouselAutoplayIndicator,
    CarouselPanel,
} from "@/components/ui/carousel";
import { ChevronDownFilledIcon, PriorityNoneIcon } from "@/components/ui/icons";
import { CmdKbd } from "@/components/ui/kbd";
import LifestyleImage from "@/public/ai-section-lifestyle.webp";
import TravelImage from "@/public/ai-section-travel.webp";

const AUTO_PLAY_MS = 10_000;

/**
 * The scene is the library at 72% of its product scale.
 *
 * Every dimension below is the product value times 0.72, so the illustration
 * keeps the proportions of the real screen: a 400px sidebar becomes 288px, the
 * 32px page padding becomes 24px, the 13px navigation labels become 9.5px,
 * the 16px row icons become 11.5px, and the 14px card radius becomes 10px.
 *
 * The masonry keeps the product behaviour: its columns are ~200px wide at any
 * window size, so they become ~147px here, and the column count follows the
 * space left by the sidebar.
 */
const SCENE_HEIGHT = "h-[420px] sm:h-[520px] lg:h-[600px]";
const SIDEBAR_WIDTH = "w-[186px] lg:w-[288px]";
const GRID_GAP = "gap-3";
const CARD_COLUMN_WIDTH = "w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)]";

/**
 * The scene is a viewport into a library that continues below the fold. The
 * fade tells the reader that the grid does not end at the frame.
 */
const GRID_FADE_STYLE = {
    maskImage: "linear-gradient(to bottom, black 68%, transparent 100%)",
    WebkitMaskImage: "linear-gradient(to bottom, black 68%, transparent 100%)",
} as React.CSSProperties;

const LABEL_ADD_NEW = msg("Add new");
const LABEL_AUTOMATIONS = msg("Automations");
const LABEL_COLLECTIONS = msg("Collections");
const LABEL_DISMISS = msg("Dismiss");
const LABEL_FAVORITES = msg("Favorites");
const LABEL_INTEGRATIONS = msg("Integrations");
const LABEL_LIBRARY = msg("Library");
const LABEL_MORE = msg("More");
const LABEL_SHOWING = msg("Showing {count} items");
const LABEL_SMART_COLLECTIONS = msg("Smart Collections");
const LABEL_SMART_COLLECTIONS_STATE = msg("is active");

type PreviewKind =
    | "article"
    | "chart"
    | "code"
    | "map"
    | "photo"
    | "placeholder"
    | "recipe"
    | "text"
    | "video";

type CollectionIconId = "archive" | "high" | "low" | "medium" | "none";

type SuggestionIconId = "browse" | "filter" | "group";

type PhotoId = "lifestyle" | "travel";

interface SceneCard {
    aspect: "aspect-[3/4]" | "aspect-[4/3]" | "aspect-[4/5]" | "aspect-square";
    hasCollections: boolean;
    id: string;
    isFeatured?: boolean;
    photo?: PhotoId;
    preview: PreviewKind;
    title: string;
    tone: string;
}

interface SceneCollection {
    color: string;
    count: number;
    icon: CollectionIconId;
    name: string;
}

interface SceneCollectionGroup {
    collections: SceneCollection[];
    label: string;
}

interface SceneSuggestion {
    icon: SuggestionIconId;
    id: string;
    label: string;
    shortcut: string;
}

interface Scene {
    collectionCount: number;
    collectionGroups: SceneCollectionGroup[];
    columns: SceneCard[][];
    detail: string;
    favoritesCount: number;
    id: string;
    label: string;
    query: string;
    resultCount: number;
    suggestions: SceneSuggestion[];
}

const COLLECTION_ICONS = {
    archive: Archive,
    high: Sparkle,
    low: SignalMedium,
    medium: SignalHigh,
    none: PriorityNoneIcon,
} as const;

const SUGGESTION_ICONS = {
    browse: FolderOpen,
    filter: Funnel,
    group: Layers3,
} as const;

const PHOTOS = {
    lifestyle: LifestyleImage,
    travel: TravelImage,
} as const;

const CHART_BARS = [
    { height: 42, id: "bar-1", opacity: 0.32 },
    { height: 66, id: "bar-2", opacity: 0.44 },
    { height: 38, id: "bar-3", opacity: 0.56 },
    { height: 82, id: "bar-4", opacity: 0.68 },
    { height: 54, id: "bar-5", opacity: 0.8 },
    { height: 94, id: "bar-6", opacity: 0.92 },
] as const;

const RECIPE_STEPS = [
    { id: "step-1", width: "w-full" },
    { id: "step-2", width: "w-4/5" },
    { id: "step-3", width: "w-11/12" },
    { id: "step-4", width: "w-2/3" },
] as const;

const TEXT_LINES = [
    { id: "line-1", width: "w-full" },
    { id: "line-2", width: "w-11/12" },
    { id: "line-3", width: "w-4/5" },
    { id: "line-4", width: "w-full" },
    { id: "line-5", width: "w-3/5" },
] as const;

const SCENES: Scene[] = [
    {
        collectionCount: 36,
        collectionGroups: [
            {
                collections: [
                    {
                        color: "#EB144C",
                        count: 12,
                        icon: "high",
                        name: msg("Lisbon, May"),
                    },
                    {
                        color: "#FF6900",
                        count: 34,
                        icon: "medium",
                        name: msg("Food and coffee"),
                    },
                    {
                        color: "#0693E3",
                        count: 7,
                        icon: "low",
                        name: msg("Museum guides"),
                    },
                    {
                        color: "#00D084",
                        count: 5,
                        icon: "none",
                        name: msg("Design hotels"),
                    },
                ],
                label: msg("Today"),
            },
            {
                collections: [
                    {
                        color: "#8A2BE2",
                        count: 9,
                        icon: "low",
                        name: msg("Fado venues"),
                    },
                    {
                        color: "#F78DA7",
                        count: 4,
                        icon: "none",
                        name: msg("Tile murals"),
                    },
                    {
                        color: "#FCB900",
                        count: 6,
                        icon: "medium",
                        name: msg("Sunset spots"),
                    },
                    {
                        color: "#8492A6",
                        count: 3,
                        icon: "archive",
                        name: msg("Trams and buses"),
                    },
                ],
                label: msg("Last 3 days"),
            },
            {
                collections: [
                    {
                        color: "#0079BF",
                        count: 11,
                        icon: "low",
                        name: msg("Day trips"),
                    },
                    {
                        color: "#F8842C",
                        count: 8,
                        icon: "none",
                        name: msg("Pastry shops"),
                    },
                ],
                label: msg("Last 7 days"),
            },
            {
                collections: [
                    {
                        color: "#8492A6",
                        count: 6,
                        icon: "archive",
                        name: msg("Old itineraries"),
                    },
                ],
                label: msg("Last 30 days"),
            },
        ],
        columns: [
            [
                {
                    aspect: "aspect-[3/4]",
                    hasCollections: true,
                    id: "weekend-alfama",
                    isFeatured: true,
                    photo: "travel",
                    preview: "photo",
                    title: msg("Alfama before the crowds"),
                    tone: "#EB144C",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "weekend-itinerary",
                    preview: "article",
                    title: msg("A three-day Lisbon itinerary"),
                    tone: "#FF6900",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "weekend-cheap",
                    preview: "text",
                    title: msg("Cheapest eats in Mouraria"),
                    tone: "#00D084",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "weekend-tram",
                    preview: "video",
                    title: msg("Riding tram 28 end to end"),
                    tone: "#F03",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "weekend-museums",
                    preview: "chart",
                    title: msg("Museum hours, side by side"),
                    tone: "#0693E3",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "weekend-route",
                    preview: "map",
                    title: msg("Walking route through Alfama"),
                    tone: "#00D084",
                },
            ],
            [
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "weekend-sintra",
                    preview: "article",
                    title: msg("Sintra in a single day"),
                    tone: "#8A2BE2",
                },
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "weekend-market",
                    photo: "lifestyle",
                    preview: "photo",
                    title: msg("Market day in Campo de Ourique"),
                    tone: "#CB1F27",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "weekend-packing",
                    preview: "recipe",
                    title: msg("Packing list for three days"),
                    tone: "#F8842C",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "weekend-murals",
                    preview: "placeholder",
                    title: msg("Tile murals of Alfama"),
                    tone: "#00D084",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "weekend-mouraria",
                    preview: "text",
                    title: msg("Where to eat in Mouraria"),
                    tone: "#FF4500",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "weekend-sunset",
                    preview: "article",
                    title: msg("Best sunset viewpoints"),
                    tone: "#F78DA7",
                },
            ],
        ],
        detail: msg("City guides and itinerary notes"),
        favoritesCount: 10,
        id: "weekend",
        label: msg("Planning a weekend away"),
        query: msg("Which Lisbon spots deserve a full afternoon?"),
        resultCount: 486,
        suggestions: [
            {
                icon: "browse",
                id: "weekend-browse",
                label: msg("Browse “Lisbon, May”"),
                shortcut: "1",
            },
            {
                icon: "filter",
                id: "weekend-filter",
                label: msg("Filter by YouTube"),
                shortcut: "2",
            },
            {
                icon: "group",
                id: "weekend-group",
                label: msg("Group by source"),
                shortcut: "3",
            },
        ],
    },
    {
        collectionCount: 21,
        collectionGroups: [
            {
                collections: [
                    {
                        color: "#FF6900",
                        count: 18,
                        icon: "high",
                        name: msg("Espresso gear"),
                    },
                    {
                        color: "#00D084",
                        count: 26,
                        icon: "medium",
                        name: msg("Recipes"),
                    },
                    {
                        color: "#0693E3",
                        count: 11,
                        icon: "low",
                        name: msg("Grinder reviews"),
                    },
                    {
                        color: "#8492A6",
                        count: 9,
                        icon: "none",
                        name: msg("Roasters"),
                    },
                ],
                label: msg("Today"),
            },
            {
                collections: [
                    {
                        color: "#0079BF",
                        count: 6,
                        icon: "low",
                        name: msg("Scales and timers"),
                    },
                    {
                        color: "#B5EAEA",
                        count: 5,
                        icon: "none",
                        name: msg("Water recipes"),
                    },
                    {
                        color: "#B04632",
                        count: 14,
                        icon: "medium",
                        name: msg("Beans to try"),
                    },
                    {
                        color: "#AFF57C",
                        count: 7,
                        icon: "archive",
                        name: msg("Brew ratios"),
                    },
                ],
                label: msg("Last 3 days"),
            },
            {
                collections: [
                    {
                        color: "#D6BBF4",
                        count: 3,
                        icon: "low",
                        name: msg("Cafe visits"),
                    },
                ],
                label: msg("Last 7 days"),
            },
            {
                collections: [
                    {
                        color: "#8492A6",
                        count: 5,
                        icon: "archive",
                        name: msg("Old setups"),
                    },
                ],
                label: msg("Last 30 days"),
            },
        ],
        columns: [
            [
                {
                    aspect: "aspect-[3/4]",
                    hasCollections: true,
                    id: "coffee-bench",
                    photo: "lifestyle",
                    preview: "photo",
                    title: msg("The bench by the window"),
                    tone: "#EB144C",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "coffee-niche",
                    preview: "article",
                    title: msg("Niche Zero, two years in"),
                    tone: "#FF6900",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "coffee-ratios",
                    preview: "text",
                    title: msg("Brew ratios that worked"),
                    tone: "#00D084",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "coffee-dialin",
                    preview: "video",
                    title: msg("Dialing in for a ristretto"),
                    tone: "#F03",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "coffee-grinders",
                    preview: "chart",
                    title: msg("Grinder comparison table"),
                    tone: "#0693E3",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "coffee-scale",
                    preview: "article",
                    title: msg("Scales with a timer built in"),
                    tone: "#0079BF",
                },
            ],
            [
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "coffee-ode",
                    preview: "text",
                    title: msg("Fellow Ode versus the Niche"),
                    tone: "#FF4500",
                },
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "coffee-recipe",
                    preview: "recipe",
                    title: msg("My espresso recipe"),
                    tone: "#00D084",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "coffee-temp",
                    preview: "code",
                    title: msg("Temperature controller setup"),
                    tone: "#B388EB",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "coffee-roasters",
                    preview: "placeholder",
                    title: msg("Roasters worth a visit"),
                    tone: "#B5EAEA",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "coffee-water",
                    preview: "text",
                    title: msg("Water temperature notes"),
                    tone: "#7FDBFF",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "coffee-cost",
                    preview: "chart",
                    title: msg("Cost per cup at home"),
                    tone: "#F8842C",
                },
            ],
        ],
        detail: msg("Grinder guides and setup notes"),
        favoritesCount: 4,
        id: "coffee-gear",
        label: msg("Comparing coffee gear"),
        query: msg("Which grinder should I buy for espresso?"),
        resultCount: 213,
        suggestions: [
            {
                icon: "browse",
                id: "coffee-browse",
                label: msg("Browse “Espresso gear”"),
                shortcut: "1",
            },
            {
                icon: "filter",
                id: "coffee-filter",
                label: msg("Filter by Reddit"),
                shortcut: "2",
            },
            {
                icon: "group",
                id: "coffee-group",
                label: msg("Group by source"),
                shortcut: "3",
            },
        ],
    },
    {
        collectionCount: 14,
        collectionGroups: [
            {
                collections: [
                    {
                        color: "#EB144C",
                        count: 14,
                        icon: "high",
                        name: msg("Release 4.2"),
                    },
                    {
                        color: "#0693E3",
                        count: 22,
                        icon: "medium",
                        name: msg("Accessibility"),
                    },
                    {
                        color: "#8492A6",
                        count: 31,
                        icon: "none",
                        name: msg("Docs"),
                    },
                    {
                        color: "#8A2BE2",
                        count: 8,
                        icon: "low",
                        name: msg("Support playbook"),
                    },
                ],
                label: msg("Today"),
            },
            {
                collections: [
                    {
                        color: "#00D084",
                        count: 5,
                        icon: "low",
                        name: msg("Migration notes"),
                    },
                    {
                        color: "#FCB900",
                        count: 4,
                        icon: "none",
                        name: msg("Keyboard traps"),
                    },
                    {
                        color: "#AFF57C",
                        count: 12,
                        icon: "medium",
                        name: msg("QA checklists"),
                    },
                    {
                        color: "#B6C8A9",
                        count: 6,
                        icon: "archive",
                        name: msg("Release drafts"),
                    },
                ],
                label: msg("Last 3 days"),
            },
            {
                collections: [
                    {
                        color: "#0079BF",
                        count: 9,
                        icon: "low",
                        name: msg("Roadmap"),
                    },
                    {
                        color: "#F78DA7",
                        count: 3,
                        icon: "none",
                        name: msg("Customer calls"),
                    },
                ],
                label: msg("Last 7 days"),
            },
            {
                collections: [
                    {
                        color: "#8492A6",
                        count: 4,
                        icon: "archive",
                        name: msg("Old releases"),
                    },
                ],
                label: msg("Last 30 days"),
            },
        ],
        columns: [
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: true,
                    id: "release-notes",
                    isFeatured: true,
                    preview: "code",
                    title: msg("Release notes, 4.2"),
                    tone: "#22D3EE",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "release-a11y",
                    preview: "article",
                    title: msg("Keyboard navigation audit"),
                    tone: "#0693E3",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "release-issues",
                    preview: "text",
                    title: msg("Eleven closed issues"),
                    tone: "#8A2BE2",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "release-walkthrough",
                    preview: "video",
                    title: msg("Walkthrough of the new library"),
                    tone: "#F03",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "release-imports",
                    preview: "chart",
                    title: msg("Import times after the rewrite"),
                    tone: "#00D084",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "release-checklist",
                    preview: "recipe",
                    title: msg("Release checklist"),
                    tone: "#00A9FE",
                },
            ],
            [
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "release-shipped",
                    preview: "text",
                    title: msg("What shipped in 4.2"),
                    tone: "#EB144C",
                },
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "release-migration",
                    preview: "placeholder",
                    title: msg("Migration guide for API clients"),
                    tone: "#A78BFA",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "release-changelog",
                    preview: "code",
                    title: msg("Changelog script"),
                    tone: "#22D3EE",
                },
            ],
            [
                {
                    aspect: "aspect-[4/3]",
                    hasCollections: false,
                    id: "release-reactions",
                    preview: "placeholder",
                    title: msg("Early reactions from users"),
                    tone: "#FF4500",
                },
                {
                    aspect: "aspect-[4/5]",
                    hasCollections: false,
                    id: "release-playbook",
                    preview: "text",
                    title: msg("Support playbook notes"),
                    tone: "#F78DA7",
                },
                {
                    aspect: "aspect-square",
                    hasCollections: false,
                    id: "release-adoption",
                    preview: "chart",
                    title: msg("Adoption after the launch"),
                    tone: "#00D084",
                },
            ],
        ],
        detail: msg("Accessibility and release notes"),
        favoritesCount: 7,
        id: "product-release",
        label: msg("Preparing a product release"),
        query: msg("Summarize what changed in the last release"),
        resultCount: 158,
        suggestions: [
            {
                icon: "browse",
                id: "release-browse",
                label: msg("Browse “Release 4.2”"),
                shortcut: "1",
            },
            {
                icon: "filter",
                id: "release-filter",
                label: msg("Filter by GitHub"),
                shortcut: "2",
            },
            {
                icon: "group",
                id: "release-group",
                label: msg("Group by source"),
                shortcut: "3",
            },
        ],
    },
];

const SCENE_VARIANTS: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { delayChildren: 0.04, staggerChildren: 0.07 },
    },
};

const PANEL_VARIANTS: Variants = {
    hidden: { filter: "blur(6px)", opacity: 0, y: 12 },
    visible: {
        filter: "blur(0px)",
        opacity: 1,
        transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
        y: 0,
    },
};

const ITEM_VARIANTS: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
        opacity: 1,
        transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        y: 0,
    },
};

export function HomepageHero() {
    const m = useMessages();

    return (
        <Carousel autoPlayMs={AUTO_PLAY_MS}>
            <CarouselActiveSlide>
                {(index) => {
                    const scene = index === null ? null : SCENES[index];
                    return (
                        // The badge reserves its row so the scene below does
                        // not jump when the first slide reports its index.
                        <div className="flex h-9 items-start">
                            <AnimatePresence mode="popLayout">
                                {scene ? (
                                    <motion.span
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="inline-flex h-9 w-fit max-w-full origin-top-left items-center gap-2 whitespace-nowrap rounded-lg border border-border/50 bg-muted px-3 text-foreground text-xs"
                                        exit={{ opacity: 0, scale: 0.99 }}
                                        initial={{ opacity: 0, scale: 1.01 }}
                                        key={scene.id}
                                    >
                                        <Sparkles className="size-3.5" />
                                        <span>{m(scene.label)}</span>
                                        <span className="hidden text-muted-foreground sm:inline">
                                            {m(scene.detail)}
                                        </span>
                                        <CarouselAutoplayIndicator
                                            autoPlayMs={AUTO_PLAY_MS}
                                        />
                                    </motion.span>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    );
                }}
            </CarouselActiveSlide>
            <CarouselActiveSlide>
                {(index) => (
                    <div className="relative">
                        <CarouselPanel aria-hidden slideClassName="w-full">
                            {SCENES.map((scene, sceneIndex) => (
                                <LibraryScene
                                    isActive={index === sceneIndex}
                                    key={scene.id}
                                    scene={scene}
                                />
                            ))}
                        </CarouselPanel>
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-foreground/10 ring-inset" />
                    </div>
                )}
            </CarouselActiveSlide>
        </Carousel>
    );
}

interface LibrarySceneProps {
    isActive: boolean;
    scene: Scene;
}

function LibraryScene({ isActive, scene }: LibrarySceneProps) {
    const controls = useAnimationControls();
    const prefersReducedMotion = useReducedMotion();

    React.useEffect(() => {
        if (!isActive) {
            return;
        }
        if (prefersReducedMotion) {
            controls.set("visible");
            return;
        }
        // Reset first so the entrance replays every time the slide returns.
        controls.set("hidden");
        controls.start("visible");
    }, [controls, isActive, prefersReducedMotion]);

    return (
        <motion.div
            animate={controls}
            className={cn(
                "flex w-full select-none overflow-hidden",
                SCENE_HEIGHT
            )}
            initial="hidden"
            variants={SCENE_VARIANTS}
        >
            <SceneSidebar scene={scene} />
            <SceneMain scene={scene} />
        </motion.div>
    );
}

interface SceneSidebarProps {
    scene: Scene;
}

function SceneSidebar({ scene }: SceneSidebarProps) {
    const m = useMessages();

    return (
        <motion.aside
            className={cn(
                "hidden shrink-0 flex-col border-border/70 border-r bg-background p-3 py-5 sm:flex lg:p-6",
                SIDEBAR_WIDTH
            )}
            variants={PANEL_VARIANTS}
        >
            <nav className="flex flex-col gap-px">
                <SceneNavRow icon={Compass} isActive label={m(LABEL_LIBRARY)} />
                <SceneNavRow
                    count="2"
                    icon={ClockFading}
                    label={m(LABEL_AUTOMATIONS)}
                />
                <SceneNavRow icon={Ellipsis} label={m(LABEL_MORE)} />
            </nav>
            <SceneGroupHeader isOpen={false} label={m(LABEL_INTEGRATIONS)} />
            <SceneGroupHeader
                count={scene.favoritesCount}
                isOpen={false}
                label={m(LABEL_FAVORITES)}
            />
            <div className="mt-5 flex items-center gap-1.5 px-1.5">
                <span className="font-medium text-[9px] text-muted-foreground">
                    {m(LABEL_COLLECTIONS)}
                    <span className="ml-1 opacity-80">
                        {scene.collectionCount}
                    </span>
                </span>
                <ChevronDownFilledIcon
                    aria-hidden
                    className="-ml-0.5 size-3 rotate-90"
                    focusable="false"
                />
                <span className="ml-auto flex items-center gap-2 text-muted-foreground/70">
                    <ListFilter className="size-3" />
                    <Plus className="size-3" />
                </span>
            </div>
            <div className="mt-2 flex items-center px-1.5 text-[8px] text-muted-foreground">
                <span className="w-fit text-foreground underline decoration-muted-foreground/20 decoration-dotted underline-offset-2">
                    {m(LABEL_SMART_COLLECTIONS)}
                </span>
                <span>&nbsp;{m(LABEL_SMART_COLLECTIONS_STATE)}</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-2">
                {scene.collectionGroups.map((group) => (
                    <div className="flex flex-col" key={group.label}>
                        <div className="flex items-center p-1.5 text-[8px] text-muted-foreground">
                            {m(group.label)}
                        </div>
                        <div className="flex flex-col gap-px">
                            {group.collections.map((collection) => (
                                <SceneCollectionRow
                                    collection={collection}
                                    key={collection.name}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </motion.aside>
    );
}

interface SceneNavRowProps {
    count?: string;
    icon: React.ElementType;
    isActive?: boolean;
    label: string;
}

function SceneNavRow({ count, icon: Icon, isActive, label }: SceneNavRowProps) {
    return (
        <div
            className={cn(
                "flex h-[23px] items-center gap-1 rounded-md px-1.5 text-[9.5px]",
                isActive
                    ? "bg-muted font-medium text-foreground"
                    : "font-medium text-foreground/70"
            )}
        >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
            {count ? (
                <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                    {count}
                </span>
            ) : null}
        </div>
    );
}

interface SceneGroupHeaderProps {
    count?: number;
    isOpen: boolean;
    label: string;
}

function SceneGroupHeader({ count, isOpen, label }: SceneGroupHeaderProps) {
    return (
        <div className="mt-5 flex items-center gap-1 px-1.5 text-[9px] text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            {count === undefined ? null : (
                <span className="opacity-80">{count}</span>
            )}
            <ChevronDownFilledIcon
                aria-hidden
                className={cn("-ml-0.5 size-3", isOpen && "rotate-90")}
                focusable="false"
            />
        </div>
    );
}

interface SceneCollectionRowProps {
    collection: SceneCollection;
}

function SceneCollectionRow({ collection }: SceneCollectionRowProps) {
    const m = useMessages();
    const Icon = COLLECTION_ICONS[collection.icon];

    return (
        <div className="flex h-[23px] items-center gap-1.5 rounded-md px-1.5">
            <span
                className="flex size-4 shrink-0 items-center justify-center rounded-[5px]"
                style={{
                    backgroundColor: `color-mix(in srgb, ${collection.color} 10%, transparent)`,
                    color: `color-mix(in srgb, ${collection.color}, light-dark(black, white) 20%)`,
                }}
            >
                <Icon aria-hidden className="size-3" focusable="false" />
            </span>
            <span className="truncate font-medium text-[10px] text-foreground/90">
                {m(collection.name)}
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                {collection.count}
            </span>
        </div>
    );
}

interface SceneMainProps {
    scene: Scene;
}

function SceneMain({ scene }: SceneMainProps) {
    const m = useMessages();

    return (
        <motion.div
            className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-3 lg:p-6"
            variants={PANEL_VARIANTS}
        >
            <motion.div
                className="squircle space-y-3 rounded-xl bg-background px-3 pt-1 pb-2 shadow-xs/10 ring-1 ring-foreground/10 ring-inset dark:bg-muted"
                variants={ITEM_VARIANTS}
            >
                <div className="flex h-[29px] items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">
                        {m(scene.query)}
                    </span>
                    <span className="shrink-0 text-[8px] text-muted-foreground opacity-50">
                        <CmdKbd />G
                    </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <SquarePen className="size-2.5" />
                        {m(LABEL_ADD_NEW)}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Grid2x2 className="size-2.5" />
                        {m(LABEL_SHOWING, { count: scene.resultCount })}
                    </span>
                </div>
            </motion.div>

            <motion.div
                className="flex items-center gap-5 whitespace-nowrap px-3 text-[9px] text-muted-foreground"
                variants={ITEM_VARIANTS}
            >
                {scene.suggestions.map((suggestion) => {
                    const Icon = SUGGESTION_ICONS[suggestion.icon];
                    return (
                        <span
                            className="flex items-center gap-1"
                            key={suggestion.id}
                        >
                            <Icon className="size-2.5" />
                            {m(suggestion.label)}
                        </span>
                    );
                })}
                <span className="flex items-center gap-1">
                    {m(LABEL_DISMISS)}
                    <span className="opacity-50">
                        <CmdKbd />
                        {scene.suggestions.length + 1}
                    </span>
                </span>
            </motion.div>

            <div
                className="min-h-0 flex-1 overflow-hidden"
                style={GRID_FADE_STYLE}
            >
                <div className={cn("flex flex-wrap", GRID_GAP)}>
                    {scene.columns.map((column) => (
                        <div
                            className={cn(
                                "flex flex-col",
                                CARD_COLUMN_WIDTH,
                                GRID_GAP
                            )}
                            key={column.map((card) => card.id).join("-")}
                        >
                            {column.map((card) => (
                                <SceneCardView card={card} key={card.id} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

interface SceneCardViewProps {
    card: SceneCard;
}

function SceneCardView({ card }: SceneCardViewProps) {
    const m = useMessages();

    return (
        <motion.div variants={ITEM_VARIANTS}>
            <div
                className={cn(
                    "squircle relative w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/5 ring-inset",
                    card.aspect
                )}
            >
                <ScenePreview card={card} />
                {card.isFeatured ? (
                    <span className="absolute right-1.5 bottom-1.5 flex items-center gap-px rounded-md bg-black/55 p-0.5 text-white shadow-lg">
                        <ArrowUpRight className="size-2.5" />
                        <Star className="size-2.5 fill-current" />
                    </span>
                ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1">
                {card.hasCollections ? (
                    <Squircle
                        aria-hidden
                        className="size-3 shrink-0 text-muted-foreground"
                        focusable="false"
                    />
                ) : (
                    <SquircleDashed
                        aria-hidden
                        className="size-3 shrink-0 text-muted-foreground"
                        focusable="false"
                    />
                )}
                <span className="truncate text-[9px] text-foreground">
                    {m(card.title)}
                </span>
            </div>
        </motion.div>
    );
}

interface ScenePreviewProps {
    card: SceneCard;
}

function ScenePreview({ card }: ScenePreviewProps) {
    switch (card.preview) {
        case "article":
            return <ArticlePreview tone={card.tone} />;
        case "chart":
            return <ChartPreview tone={card.tone} />;
        case "code":
            return <CodePreview tone={card.tone} />;
        case "map":
            return <MapPreview tone={card.tone} />;
        case "photo":
            return (
                <Image
                    alt=""
                    className="size-full object-cover"
                    fill
                    sizes="(max-width: 640px) 45vw, 180px"
                    src={PHOTOS[card.photo ?? "travel"]}
                />
            );
        case "placeholder":
            return <FailedPreview />;
        case "recipe":
            return <RecipePreview tone={card.tone} />;
        case "text":
            return <TextPreview tone={card.tone} />;
        case "video":
            return <VideoPreview tone={card.tone} />;
        default: {
            const unsupported: never = card.preview;
            throw new Error(`Unsupported preview kind: ${unsupported}`);
        }
    }
}

interface PreviewProps {
    tone: string;
}

function ArticlePreview({ tone }: PreviewProps) {
    return (
        <div className="flex size-full flex-col gap-1 bg-background p-2">
            <span
                className="h-1 w-5 rounded-full"
                style={{ backgroundColor: tone }}
            />
            <span className="h-1.5 w-4/5 rounded-full bg-foreground/70" />
            <span className="h-1.5 w-3/5 rounded-full bg-foreground/30" />
            <span className="mt-1 h-1 w-full rounded-full bg-foreground/15" />
            <span className="h-1 w-11/12 rounded-full bg-foreground/15" />
            <div
                className="relative mt-auto h-1/3 w-full overflow-hidden rounded-md"
                style={{
                    background: `linear-gradient(135deg, ${tone}, ${tone}33)`,
                }}
            >
                <span className="absolute top-1/3 left-1/4 h-1 w-1/2 rounded-full bg-white/30" />
                <span className="absolute right-1/5 bottom-1/4 size-2 rounded-full bg-white/25" />
                <span className="absolute bottom-1/4 left-1/3 h-1 w-1/4 rounded-full bg-white/20" />
            </div>
        </div>
    );
}

function ChartPreview({ tone }: PreviewProps) {
    return (
        <div className="flex size-full flex-col gap-1.5 bg-background p-2">
            <span className="h-1.5 w-2/5 rounded-full bg-foreground/55" />
            <span className="h-1 w-3/4 rounded-full bg-foreground/12" />
            <div className="flex h-1/2 items-end gap-1 rounded-md bg-muted/70 p-1.5">
                {CHART_BARS.map((bar) => (
                    <span
                        className="flex-1 rounded-t-[2px]"
                        key={bar.id}
                        style={{
                            backgroundColor: tone,
                            height: `${bar.height}%`,
                            opacity: bar.opacity,
                        }}
                    />
                ))}
            </div>
            <span className="mt-auto h-1 w-1/2 rounded-full bg-foreground/12" />
        </div>
    );
}

function CodePreview({ tone }: PreviewProps) {
    return (
        <div className="flex size-full flex-col gap-1 bg-neutral-900 p-2 font-mono">
            <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-red-400/70" />
                <span className="size-1.5 rounded-full bg-amber-400/70" />
                <span className="size-1.5 rounded-full bg-emerald-400/70" />
            </div>
            <span
                className="mt-1 h-1 w-1/3 rounded-full"
                style={{ backgroundColor: tone }}
            />
            <span className="h-1 w-5/6 rounded-full bg-sky-300/70" />
            <span className="h-1 w-2/3 rounded-full bg-amber-300/60" />
            <span className="h-1 w-4/5 rounded-full bg-emerald-300/60" />
            <span className="h-1 w-1/2 rounded-full bg-sky-300/40" />
            <span className="h-1 w-3/5 rounded-full bg-amber-300/40" />
            <span className="mt-auto flex items-center gap-1">
                <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tone }}
                />
                <span className="h-1 w-8 rounded-full bg-white/20" />
            </span>
        </div>
    );
}

function MapPreview({ tone }: PreviewProps) {
    return (
        <div className="relative size-full bg-[#E8E4DC]">
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `linear-gradient(${tone}1f 1px, transparent 1px), linear-gradient(90deg, ${tone}1f 1px, transparent 1px)`,
                    backgroundSize: "16px 16px",
                }}
            />
            <span className="absolute top-[42%] left-0 h-1.5 w-full bg-white/80" />
            <span className="absolute top-0 left-[46%] h-full w-1.5 bg-white/80" />
            <span className="absolute top-[18%] left-[24%] h-1 w-2/3 rotate-12 bg-white/60" />
            <span className="absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
                <MapPin className="size-2.5" style={{ color: tone }} />
            </span>
        </div>
    );
}

function RecipePreview({ tone }: PreviewProps) {
    return (
        <div className="flex size-full flex-col gap-1.5 bg-background p-2">
            <span className="h-1.5 w-1/3 rounded-full bg-foreground/55" />
            {RECIPE_STEPS.map((step) => (
                <span className="flex items-center gap-1" key={step.id}>
                    <span
                        className="size-2 shrink-0 rounded-full border"
                        style={{ borderColor: tone }}
                    />
                    <span
                        className={`h-1 rounded-full bg-foreground/12 ${step.width}`}
                    />
                </span>
            ))}
            <span
                className="mt-auto h-2.5 w-12 rounded-full"
                style={{ backgroundColor: tone }}
            />
        </div>
    );
}

function TextPreview({ tone }: PreviewProps) {
    return (
        <div className="flex size-full flex-col gap-1.5 bg-background p-2">
            <span className="h-1.5 w-4/5 rounded-full bg-foreground/80" />
            <span className="h-1.5 w-2/5 rounded-full bg-foreground/80" />
            <div className="mt-1 flex flex-col gap-1">
                {TEXT_LINES.map((line) => (
                    <span
                        className={`h-1 rounded-full bg-foreground/20 ${line.width}`}
                        key={line.id}
                    />
                ))}
            </div>
            <span
                className="mt-auto h-1 w-1/3 rounded-full"
                style={{ backgroundColor: tone }}
            />
        </div>
    );
}

function VideoPreview({ tone }: PreviewProps) {
    return (
        <div className="relative flex size-full items-center justify-center bg-neutral-950">
            <span
                className="absolute inset-0"
                style={{
                    background: `radial-gradient(circle at 50% 40%, ${tone}55, transparent 70%)`,
                }}
            />
            <span className="relative flex size-7 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm">
                <Play className="size-3 fill-white text-white" />
            </span>
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 font-medium text-[7px] text-white">
                12:04
            </span>
            <span className="absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-black/70 to-transparent" />
        </div>
    );
}

/**
 * The product shows a textured panel and a broken-link glyph when a preview
 * cannot be fetched.
 */
function FailedPreview() {
    return (
        <div className="texture-screen relative flex size-full flex-col items-center justify-center bg-muted/80">
            <GlobeX
                aria-hidden
                className="size-4 text-muted-foreground opacity-50"
                focusable="false"
            />
        </div>
    );
}
