
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

// --- Esconde o bloco de navegação (busca + tabs) ao rolar pra baixo,
//     mostra ao rolar pra cima. APENAS MOBILE: no desktop, o wrapper
//     é display:contents e o transform não tem efeito visual.
//     O wrapper #mobileNavBlock é sticky no mobile, então um único
//     transform desliza busca + tabs como UM bloco. ---
(function initHideOnScrollStickyBars() {
    const navBlock = document.getElementById('mobileNavBlock');
    if (!navBlock) return;

    let lastY = window.scrollY;
    let ticking = false;
    let isHidden = false;
    const DELTA_THRESHOLD = 6;   // ignora micro-movimentos / jitter
    const ACTIVATE_AFTER = 80;   // não esconde perto do topo

    function shouldKeepVisible() {
        const input = document.getElementById('purificacaoInput');
        if (input && document.activeElement === input) return true;
        if (input && input.value.trim() !== '') return true;
        const dropdown = document.getElementById('purificacaoSuggestions');
        if (dropdown && !dropdown.classList.contains('hidden')) return true;
        return false;
    }

    function applyState() {
        navBlock.style.transform = isHidden ? 'translateY(-100%)' : '';
    }

    function setHidden(hidden) {
        if (hidden === isHidden) return;
        isHidden = hidden;
        applyState();
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            const delta = y - lastY;
            if (Math.abs(delta) > DELTA_THRESHOLD) {
                if (shouldKeepVisible()) {
                    setHidden(false);
                } else if (delta > 0 && y > ACTIVATE_AFTER) {
                    setHidden(true);
                } else if (delta < 0) {
                    setHidden(false);
                }
                lastY = y;
            }
            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
})();
