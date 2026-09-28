import { MIME_TYPES } from "@/lib/common/constants";

const FILE_EXTENSION_RE = /^(.+)\.[^./\\]*$/;

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

    if (!file.type || file.type.startsWith("image/")) {
        // when the file is an image, make sure the extension corresponds to the
        // actual mimeType (this is an edge case, but happens - especially
        // with AI generated images)
        const mimeType = await getActualMimeTypeFromImage(file);
        if (mimeType) {
            const currentExtension = file.name.split(".").at(-1)?.toLowerCase();
            const shouldRename =
                currentExtension !== mimeType.extension &&
                !(mimeType.extension === "jpg" && currentExtension === "jpeg");
            if (shouldRename || mimeType.mimeType !== file.type) {
                const name = shouldRename
                    ? `${file.name.replace(FILE_EXTENSION_RE, "$1")}.${mimeType.extension}`
                    : file.name;
                file = blobToFile(
                    file,
                    mimeType.mimeType,
                    name
                ) as NormalizedFile;
            }
        }
    }

    file[normalizedFileSymbol] = true;

    return file as File;
};

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
    const leadingBytes = [
        ...new Uint8Array(await blobToArrayBuffer(file.slice(0, 15))),
    ].join(" ");

    for (const [type, pattern] of Object.entries(BYTES)) {
        if (leadingBytes.match(pattern)) {
            return {
                extension: type,
                mimeType: MIME_TYPES[type as keyof typeof BYTES],
            };
        }
    }

    return null;
};

export const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
    if ("arrayBuffer" in blob) {
        return blob.arrayBuffer();
    }
    // Safari
    return readBlobWithReader(blob, "arrayBuffer", (result) => {
        if (!(result instanceof ArrayBuffer)) {
            throw new Error("Couldn't convert blob to ArrayBuffer");
        }
        return result;
    });
};

export const blobToDataURL = async (blob: Blob): Promise<string> => {
    if (!blob) {
        throw new Error("No blob provided");
    }
    return await readBlobWithReader(blob, "dataURL", (result) => {
        if (typeof result !== "string") {
            throw new Error("Failed to convert blob to data URL");
        }
        return result;
    });
};

export const blobToText = async (blob: Blob): Promise<string> => {
    if (!blob) {
        throw new Error("No blob provided");
    }
    return await readBlobWithReader(blob, "text", (result) => {
        if (typeof result !== "string") {
            throw new Error("Failed to convert blob to text");
        }
        return result;
    });
};

type BlobReadMethod = "arrayBuffer" | "dataURL" | "text";

function readBlobWithReader<T>(
    blob: Blob,
    method: BlobReadMethod,
    selectResult: (result: string | ArrayBuffer | null) => T
): Promise<T> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                resolve(selectResult(reader.result));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        reader.onabort = () => {
            reject(reader.error ?? new Error("FileReader error"));
        };
        if (method === "arrayBuffer") {
            reader.readAsArrayBuffer(blob);
        } else if (method === "dataURL") {
            reader.readAsDataURL(blob);
        } else {
            reader.readAsText(blob);
        }
    });
}
