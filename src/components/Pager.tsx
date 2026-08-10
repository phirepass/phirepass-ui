import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { getPaginationRange } from '@/lib/pagination';

interface PagerProps {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
}

/** Renders nothing for a single page, so callers can drop it in unconditionally. */
export function Pager({ page, pageCount, onPageChange }: PagerProps) {
    if (pageCount <= 1) {
        return null;
    }

    return (
        <Pagination className="justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        aria-disabled={page === 1}
                        className={page === 1 ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(e) => {
                            e.preventDefault();
                            if (page > 1) onPageChange(page - 1);
                        }}
                    />
                </PaginationItem>
                {getPaginationRange(page, pageCount).map((entry, index) => (
                    entry === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                        </PaginationItem>
                    ) : (
                        <PaginationItem key={entry}>
                            <PaginationLink
                                href="#"
                                isActive={entry === page}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPageChange(entry);
                                }}
                            >
                                {entry}
                            </PaginationLink>
                        </PaginationItem>
                    )
                ))}
                <PaginationItem>
                    <PaginationNext
                        href="#"
                        aria-disabled={page === pageCount}
                        className={page === pageCount ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(e) => {
                            e.preventDefault();
                            if (page < pageCount) onPageChange(page + 1);
                        }}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
}
