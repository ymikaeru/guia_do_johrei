
// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega dados
    loadData();

    // 2. Busca — os inputs viram gatilhos que abrem o modal de busca dedicado
    if (typeof setupSearchModal === 'function') {
        setupSearchModal();
    }
});

// Scroll to Top functionality
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Show/hide scroll-to-top button based on scroll position
window.addEventListener('scroll', () => {
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (scrollBtn) {
        if (window.scrollY > 300) {
            scrollBtn.classList.remove('opacity-0', 'pointer-events-none');
            scrollBtn.classList.add('opacity-100', 'pointer-events-auto');
        } else {
            scrollBtn.classList.remove('opacity-100', 'pointer-events-auto');
            scrollBtn.classList.add('opacity-0', 'pointer-events-none');
        }
    }
});

// Sub-aba mobile — sticky + headroom hide.
//
// O elemento é position:sticky no CSS (sempre no mesmo lugar). Esse JS só
// adiciona/remove a classe .is-hidden conforme a direção do scroll:
//   - Scroll down acumulado >= HIDE_THRESHOLD → adiciona .is-hidden
//     (transform translateY(-100%) → desliza atrás do chrome)
//   - Scroll up acumulado >= SHOW_THRESHOLD → remove .is-hidden
//   - Perto do topo → garante que está visível
//
// Acumuladores direcionais zeram quando o usuário reverte → evita oscilação
// por micro-trêmulos sem precisar de lock/transição.
(function initSubTabHeadroom() {
    const HIDE_THRESHOLD = 36; // px de scroll down pra esconder
    const SHOW_THRESHOLD = 24; // px de scroll up pra mostrar
    const TOP_ZONE = 24;

    let lastY = window.scrollY;
    let downAccum = 0;
    let upAccum = 0;
    let ticking = false;

    function update() {
        const el = document.getElementById('tabScopeSwitcherMobile');
        if (!el || el.style.display === 'none') { ticking = false; return; }
        const y = window.scrollY;

        if (y < TOP_ZONE) {
            el.classList.remove('is-hidden');
            lastY = y;
            downAccum = 0;
            upAccum = 0;
            ticking = false;
            return;
        }

        // Input em foco — teclado iOS dispara scroll espúrio.
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
            lastY = y;
            ticking = false;
            return;
        }

        const dy = y - lastY;
        lastY = y;

        if (dy > 0) { downAccum += dy; upAccum = 0; }
        else if (dy < 0) { upAccum += -dy; downAccum = 0; }

        const isHidden = el.classList.contains('is-hidden');
        if (!isHidden && downAccum >= HIDE_THRESHOLD) {
            el.classList.add('is-hidden');
            downAccum = 0;
        } else if (isHidden && upAccum >= SHOW_THRESHOLD) {
            el.classList.remove('is-hidden');
            upAccum = 0;
        }

        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    // Ao trocar de aba/sub-aba, garante estado visível.
    document.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.scope-tab, [onclick*="setTab"]')) {
            const el = document.getElementById('tabScopeSwitcherMobile');
            el && el.classList.remove('is-hidden');
        }
    }, true);

    // Mede a altura real do chrome (header + main tabs) e expõe via
    // CSS variable. A sub-aba sticky usa esse valor pra evitar
    // overlap com as main tabs.
    function syncStickyTop() {
        const mainTabs = document.getElementById('mobileTabsContainer');
        if (!mainTabs) return;
        const r = mainTabs.getBoundingClientRect();
        const stickyBottom = Math.max(r.bottom, 52 + mainTabs.offsetHeight);
        document.documentElement.style.setProperty('--sub-tab-sticky-top', stickyBottom + 'px');
    }
    syncStickyTop();
    window.addEventListener('resize', syncStickyTop, { passive: true });
    setTimeout(syncStickyTop, 100);
    setTimeout(syncStickyTop, 500);
})();

// --- PWA LOGIC ---
let deferredPrompt;

// SW removed — unregister any existing registrations
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent standard mini-infobar
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Show the install button
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.classList.add('flex'); // Ensure it displays as flex

        installBtn.addEventListener('click', () => {
            // Hide the app provided install promotion
            installBtn.classList.add('hidden');
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                } else {
                    console.log('User dismissed the install prompt');
                }
                deferredPrompt = null;
            });
        });
    }
});
