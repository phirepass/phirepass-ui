/**
 * First page, last page, and a one-step window around the current page, with
 * ellipses collapsing whatever falls between.
 */
export function getPaginationRange(page: number, pageCount: number): (number | 'ellipsis')[] {
    const range: (number | 'ellipsis')[] = [];
    const window = new Set([1, pageCount, page - 1, page, page + 1]);

    for (let i = 1; i <= pageCount; i++) {
        if (window.has(i)) {
            range.push(i);
        } else if (range[range.length - 1] !== 'ellipsis') {
            range.push('ellipsis');
        }
    }

    return range;
}
