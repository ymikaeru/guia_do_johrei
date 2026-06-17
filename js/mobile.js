
// --- PULL TO REFRESH LOGIC ---
// Desativado: causava reloads acidentais quando o usuário rolava perto do topo.
// Mantido o bloco abaixo apenas como referência histórica (early return acima).
(function initPullToRefresh() {
    return;
})();

// --- CUSTOM DROPDOWN LOGIC ---
// --- CUSTOM DROPDOWN LOGIC ---
// (Removed as replaced by horizontal scroll tabs)


// --- MOBILE MAP NAVIGATION ---
window.switchMobileView = function (targetId) {
    const views = ['front', 'detail', 'back'];
    STATE.currentMobileView = targetId;

    views.forEach(id => {
        const el = document.getElementById(`view-${id}`); // Fixed spacing from original snippet
        const tab = document.getElementById(`tab-${id}`); // Fixed spacing from original snippet

        if (el && tab) {
            if (id === targetId) {
                el.classList.remove('hidden');
                // Active Styling
                tab.classList.remove('bg-white', 'dark:bg-black', 'text-gray-400', 'border-gray-200', 'dark:border-gray-800');
                tab.classList.add('bg-black', 'text-white', 'border-black', 'dark:bg-white', 'dark:text-black');
            } else {
                el.classList.add('hidden');
                // Inactive Styling
                tab.classList.remove('bg-black', 'text-white', 'border-black', 'dark:bg-white', 'dark:text-black');
                tab.classList.add('bg-white', 'dark:bg-black', 'text-gray-400', 'border-gray-200', 'dark:border-gray-800');
            }
        }
    });
};

// Global helper to switch view based on point
window.autoSwitchMapToPoint = function (pointId) {
    if (window.innerWidth >= 768) return; // Tablets and desktop use full map view

    // Find which map contains the point
    let targetView = 'front'; // Default
    if (BODY_DATA.points.back.some(p => p.id === pointId)) targetView = 'back';
    else if (BODY_DATA.points.detail.some(p => p.id === pointId)) targetView = 'detail';

    // Only switch if different (and exists)
    if (targetView) {
        window.switchMobileView(targetView);
    }
};

// Mobile FAB Action
function scrollToResults() {
    const list = document.getElementById('contentList');
    list.classList.remove('hidden');
    list.scrollIntoView({ behavior: 'smooth' });
    // Hide FAB after interaction? or keep it? Keep it until deselected.
    document.getElementById('mobileFab').classList.add('hidden');
}

// --- HEADROOM DA HOME (página principal, mobile) ---
// Ao rolar a lista pra baixo, esconde o header do site (#site-header, sobe via
// translateY) E a barra "O Johrei / Fundamentos" (#mobileTabsContainer, colapsa
// via max-height) — liberando a tela toda pra leitura. Ao rolar pra cima, ou
// perto do topo, ambos voltam. A nav colapsa (é conteúdo do wrapper sticky, a
// lista sobe junto); o header desliza (é fixed/overlay). Só no mobile.
(function initNavHeadroom() {
    let lastY = window.scrollY || 0;
    const THRESHOLD = 8; // anti-jitter

    // Esconde/revela header (translateY) + barra de navegação (colapso) juntos.
    function setHidden(hide) {
        const nav = document.getElementById('mobileTabsContainer');
        const header = document.getElementById('site-header');
        if (nav) nav.classList.toggle('nav-collapsed', hide);
        if (header) header.classList.toggle('header-hidden', hide);
    }

    // Síncrono: ler scrollY e alternar uma classe é barato e não força layout.
    // Listener passivo já é limitado ao frame rate pelo browser.
    function onScroll() {
        const nav = document.getElementById('mobileTabsContainer');
        if (!nav) return;

        // No desktop a nav/header são outros — nunca esconde.
        if (!window.matchMedia('(max-width: 767px)').matches) {
            setHidden(false);
            lastY = window.scrollY || 0;
            return;
        }

        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const delta = y - lastY;
        // Modal de leitura aberto trava o scroll da página; não interferir.
        const modalOpen = !document.getElementById('readModal')?.classList.contains('hidden');

        if (y <= 8 || modalOpen) {
            setHidden(false);   // perto do topo: visível
        } else if (delta > THRESHOLD) {
            setHidden(true);    // descendo: esconde header + nav
        } else if (delta < -THRESHOLD) {
            setHidden(false);   // subindo: revela
        }
        lastY = y;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
})();
