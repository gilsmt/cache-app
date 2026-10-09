import { GTProvider } from "gt-next";
import { NotFoundContent } from "./not-found-content";

export default function NotFoundPage() {
    return (
        <GTProvider>
            <NotFoundContent />
        </GTProvider>
    );
}
