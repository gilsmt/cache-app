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
    onCancel: () => void;
    onCreated: (collection: CreateCollectionResponse["collection"]) => void;
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
                description.trim().length > 0 ? description.trim() : undefined,
        })
            .then((response) => onCreated(response.collection))
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not create the collection."
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
                aria-label="Back to list"
                className={styles.formBackRow}
                disabled={isSubmitting}
                onClick={handleCancel}
                type="button"
            >
                <svg
                    aria-hidden="true"
                    fill="none"
                    height="10"
                    viewBox="0 0 10 10"
                    width="10"
                >
                    <path
                        d="M6 2L3 5l3 3"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.4"
                    />
                </svg>
            </button>

            <input
                autoComplete="off"
                className={styles.createNameInput}
                disabled={isSubmitting}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="Collection name"
                ref={nameInputRef}
                type="text"
                value={name}
            />

            <textarea
                className={styles.createDescriptionTextarea}
                disabled={isSubmitting}
                maxLength={DESCRIPTION_MAX_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what belongs here…"
                value={description}
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
