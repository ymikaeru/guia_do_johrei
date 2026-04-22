
// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega Tema Salvo (Removido)
    // if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');

    // 2. Carrega dados
    loadData();

    // 3. Listeners de Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const clearBtn = document.getElementById('clearSearch');
            if (e.target.value) {
                STATE.activeLetter = '';
                // Se quiser que a busca limpe o mapa, descomente a linha abaixo:
                // clearBodyFilter(); 
                STATE.activeTag = null;
                renderAlphabet();
                if (clearBtn) clearBtn.classList.remove('hidden');
            } else {
                if (clearBtn) clearBtn.classList.add('hidden');
            }
            renderTabs(); // Update tab styles (remove highlight if searching)
            applyFilters();
        });
    }

    // 5. Setup Search Suggestions
    setupSearch();
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

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
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
