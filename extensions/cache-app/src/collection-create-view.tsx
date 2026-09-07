import { useEffect, useId, useRef, useState } from "react";
import type { CreateCollectionResponse } from "@/lib/api";
import styles from "./popup.module.css";

const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 1024;

export interface CollectionCreateViewProps {
    createCollection: (input: {
        name: string;
        description?: string;
    }) => Promise<CreateCollectionResponse>;
    onCreated: (collection: CreateCollectionResponse["collection"]) => void;
    onCancel: () => void;
}

export function CollectionCreateView({
    createCollection,
    onCreated,
    onCancel,
}: CollectionCreateViewProps): React.ReactElement {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const labelId = useId();
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setName("");
        setDescription("");
        setError(null);
        const inputEl = nameInputRef.current;
        if (inputEl) {
            inputEl.focus();
        }
    }, []);

    const trimmedName = name.trim();
    const isNameValid = trimmedName.length > 0;
    const canSubmit = isNameValid && !isSubmitting;

    const handleCancel = () => {
        if (isSubmitting) {
            return;
        }
        onCancel();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && !isSubmitting) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        }
    };

    const handleSubmit = () => {
        if (!canSubmit) {
            return;
        }
        setError(null);
        setIsSubmitting(true);
        void createCollection({
            name: trimmedName,
            description:
                description.trim().length > 0
                    ? description.trim()
                    : undefined,
        })
            .then((response) => onCreated(response.collection))
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not create the collection.",
                );
            })
            .finally(() => setIsSubmitting(false));
    };

    const handleNameKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && canSubmit) {
            event.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div onKeyDown={handleKeyDown}>
            <button
                type="button"
                className={styles.formBackRow}
                onClick={handleCancel}
                disabled={isSubmitting}
                aria-label="Back to list"
            >
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    aria-hidden="true"
                >
                    <path
                        d="M6 2L3 5l3 3"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            <input
                ref={nameInputRef}
                type="text"
                className={styles.createNameInput}
                placeholder="Collection name"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                disabled={isSubmitting}
            />

            <textarea
                className={styles.createDescriptionTextarea}
                placeholder="Describe what belongs here…"
                value={description}
                maxLength={DESCRIPTION_MAX_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
            />

            {error ? <p className={styles.inlineError}>{error}</p> : null}

            <div className={styles.formActions}>
                <button
                    aria-labelledby={labelId}
                    className={styles.primaryButton}
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    type="button"
                >
                    <span id={labelId}>
                        {isSubmitting ? "Creating…" : "Create collection"}
                    </span>
                </button>
            </div>
        </div>
    );
}
