/**
 * Schema v2: returns subitens (children) of a given parent entry id, sorted
 * by sub_letter (a, b, c, ...). Used by openModal to compose grouped views.
 * Empty array if the item has no children.
 */
function getChildrenOf(parentId) {
    if (!parentId || !STATE || !STATE.globalData) return [];
    const out = [];
    for (const id of Object.keys(STATE.globalData)) {
        const it = STATE.globalData[id];
        if (it && it.parent_id === parentId) out.push(it);
    }
    out.sort((a, b) => (a.sub_letter || '').localeCompare(b.sub_letter || ''));
    return out;
}

function toSlug(str) {
    if (!str) return '';
    return str
        .toString()
        .toLowerCase()
        .normalize('NFD') // Decompose combined characters (e.g., 'é' -> 'e' + '´')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start
        .replace(/-+$/, ''); // Trim - from end
}

function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/^\s*#+\s*/, '') // Remove markdown headers (###)
        .replace(/^\s*\*+\s*/, '') // Remove bold markers at start if any
        .replace(/\s*\*+\s*$/, '') // Remove bold markers at end
        .replace(/^\s*(?:[IVX]+\.|[0-9]+\.)\s*/, '') // Remove Roman (I.) or Decimal (1.) prefixes
        .trim();
}
