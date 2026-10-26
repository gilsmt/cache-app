import {
    fileOpen as _fileOpen,
    fileSave as _fileSave,
} from "browser-fs-access";
import { normalizeFile } from "@/lib/common/blob";
import { MIME_TYPES } from "@/lib/common/constants";

export type FILE_EXTENSION = Exclude<keyof typeof MIME_TYPES, "binary">;

const DEFAULT_FILE_MEDIA_TYPE = MIME_TYPES.binary;

export const fileOpen = async <M extends boolean | undefined = false>(options: {
    extensions?: FILE_EXTENSION[];
    description: string;
    multiple?: M;
}): Promise<M extends false | undefined ? File : File[]> => {
    type ReturnType = M extends false | undefined ? File : File[];

    const mimeTypes = options.extensions?.reduce<string[]>((acc, type) => {
        const mimeType = MIME_TYPES[type];
        if (!acc.includes(mimeType)) {
            acc.push(mimeType);
        }
        return acc;
    }, []);

    const extensions = options.extensions?.reduce<string[]>((acc, ext) => {
        if (ext === "jpg") {
            return acc.concat(".jpg", ".jpeg");
        }
        return acc.concat(`.${ext}`);
    }, []);

    const files = await _fileOpen({
        description: options.description,
        extensions,
        mimeTypes,
        multiple: options.multiple ?? false,
    });

    if (Array.isArray(files)) {
        return (await Promise.all(
            files.map((file) => normalizeFile(file))
        )) as ReturnType;
    }

    return (await normalizeFile(files)) as ReturnType;
};

export function saveFile(
    blob: Blob | Promise<Blob>,
    options: {
        /** supply without the extension */
        name: string;
        /** file extension */
        extension: FILE_EXTENSION;
        mimeTypes?: string[];
        description: string;
        fileHandle?: FileSystemFileHandle | null;
    }
) {
    return _fileSave(
        blob,
        {
            description: options.description,
            extensions: [`.${options.extension}`],
            fileName: `${options.name}.${options.extension}`,
            mimeTypes: options.mimeTypes,
        },
        options.fileHandle,
        false
    );
}

export interface FileAttachment {
    file: File;
    filename: string;
    mediaType: string;
    type: "file";
    url: string;
}

function resolveFileMediaType(file: File): string {
    const mediaType = file.type.trim();
    return mediaType.length > 0 ? mediaType : DEFAULT_FILE_MEDIA_TYPE;
}

export function createFileAttachment(file: File): FileAttachment {
    return {
        file,
        filename: file.name,
        mediaType: resolveFileMediaType(file),
        type: "file",
        url: URL.createObjectURL(file),
    };
}

export function revokeFileAttachmentObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
}

export type { FileSystemHandle } from "browser-fs-access";
export { supported as nativeFileSystemSupported } from "browser-fs-access";
