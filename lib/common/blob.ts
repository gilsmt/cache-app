import { MIME_TYPES } from "@/lib/common/constants";

export const blobToFile = (
    blob: Blob,
    mimeType: string,
    fileName: string | undefined
) =>
    new File([blob], fileName ?? "", {
        lastModified: Date.now(),
        type: mimeType,
    });

const normalizedFileSymbol = Symbol("fileNormalized");

interface NormalizedFile extends File {
    [normalizedFileSymbol]: typeof normalizedFileSymbol | true;
}

/**
 * Attempts to detect correct mimeType if none is set, or if an image
 * has an incorrect extension.
 */
export const normalizeFile = async (file_: File) => {
    let file = file_ as NormalizedFile;

    // to prevent double normalization (perf optim)
    if (file[normalizedFileSymbol]) {
        return file;
    }

    if (!file.type || file.type?.startsWith("image/")) {
        // when the file is an image, make sure the extension corresponds to the
        // actual mimeType (this is an edge case, but happens - especially
        // with AI generated images)
        const mimeType = await getActualMimeTypeFromImage(file);
        if (mimeType && mimeType !== file.type) {
            file = blobToFile(file, mimeType, file.name) as NormalizedFile;
        }
    }

    file[normalizedFileSymbol] = true;

    return file as File;
};

type ValueOf<T> = T[keyof T];

// uint8 leading bytes
const BYTES = {
    // https://en.wikipedia.org/wiki/GIF#Example_GIF_file
    gif: /^71 73 70 56 (55|57) 97\b/,
    // https://en.wikipedia.org/wiki/JPEG#Syntax_and_structure
    // jpg is a bit wonky. Checking the first three bytes should be enough,
    // but may yield false positives. (https://stackoverflow.com/a/23360709/927631)
    jpg: /^255 216 255\b/,
    // https://en.wikipedia.org/wiki/Portable_Network_Graphics#File_header
    png: /^137 80 78 71 13 10 26 10\b/,
    // 4 bytes for RIFF + 4 bytes for chunk size + WEBP identifier
    webp: /^82 73 70 70 \d+ \d+ \d+ \d+ 87 69 66 80/,
};

/**
 * Attempts to detect if a buffer is a valid image by checking its leading bytes
 */
const getActualMimeTypeFromImage = async (file: Blob | File) => {
    let mimeType: ValueOf<
        Pick<typeof MIME_TYPES, "png" | "jpg" | "gif" | "webp">
    > | null = null;

    const leadingBytes = [
        ...new Uint8Array(await blobToArrayBuffer(file.slice(0, 15))),
    ].join(" ");

    for (const type of Object.keys(BYTES) as (keyof typeof BYTES)[]) {
        if (leadingBytes.match(BYTES[type])) {
            mimeType = MIME_TYPES[type];
            break;
        }
    }

    return mimeType || file.type || null;
};

export const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    if ("arrayBuffer" in blob) {
        return blob.arrayBuffer();
    }
    // Safari
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                reject(new Error("Couldn't convert blob to ArrayBuffer"));
                return;
            }
            resolve(event.target.result as ArrayBuffer);
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.onabort = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.readAsArrayBuffer(blob);
    });
};

export const blobToDataURL = async (blob: Blob): Promise<string> =>
    await new Promise((resolve, reject) => {
        if (!blob) {
            reject(new Error("No blob provided"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                reject(new Error("Failed to convert blob to data URL"));
                return;
            }
            resolve(reader.result);
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.onabort = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.readAsDataURL(blob);
    });

export const blobToText = async (blob: Blob): Promise<string> =>
    await new Promise((resolve, reject) => {
        if (!blob) {
            reject(new Error("No blob provided"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.onabort = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.readAsText(blob);
    });
