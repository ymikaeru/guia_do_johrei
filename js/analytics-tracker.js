// ============================================================================
// Site analytics tracker — escreve em public.site_events (Supabase do CdF).
// Eventos: pageview, heartbeat (dwell time), scroll (max %), click/cta.
// Privacy-friendly: zero cookies, sem PII, respeita Do-Not-Track.
// ============================================================================

(function () {
    'use strict';

    const SITE = 'johrei';
    const SUPABASE_URL = 'https://succhmnbajvbpmoqrktq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y2NobW5iYWp2YnBtb3Fya3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjY3MDgsImV4cCI6MjA5MjA0MjcwOH0.humCcLYpnnnapkLtLOeb9ZVo5EZWoWw6ItNo0WVY3DY';
    const ENDPOINT = `${SUPABASE_URL}/rest/v1/site_events`;

    const ANON_KEY = `mioshie_${SITE}_anon_id`;
    const SESSION_KEY = `mioshie_${SITE}_session_id`;

    const FLUSH_INTERVAL_MS = 10_000;
    const HEARTBEAT_TICK_MS = 5_000;
    const HEARTBEAT_THRESHOLD_MS = 30_000;
    const MAX_QUEUE = 50;

    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
        console.debug('[tracker] DNT habilitado — sem eventos');
        return;
    }

    function uuid() {
        if (window.crypto?.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
    function lsSet(key, v) { try { localStorage.setItem(key, v); } catch { } }
    function ssGet(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
    function ssSet(key, v) { try { sessionStorage.setItem(key, v); } catch { } }

    const ANON_ID = (() => {
        let id = lsGet(ANON_KEY);
        if (!id) { id = uuid(); lsSet(ANON_KEY, id); }
        return id;
    })();

    const SESSION_ID = (() => {
        let id = ssGet(SESSION_KEY);
        if (!id) { id = uuid(); ssSet(SESSION_KEY, id); }
        return id;
    })();

    // ---------- Queue + flush ----------
    let queue = [];
    let flushTimer = null;

    function enqueue(event_type, props) {
        queue.push({
            site: SITE,
            event_type,
            anon_id: ANON_ID,
            session_id: SESSION_ID,
            path: location.pathname + location.search,
            props: props || {}
        });
        if (queue.length >= MAX_QUEUE) flushNow();
        else scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flushNow, FLUSH_INTERVAL_MS);
    }

    function flushNow() {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (!queue.length) return;
        const batch = queue;
        queue = [];

        try {
            fetch(ENDPOINT, {
                method: 'POST',
                mode: 'cors',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(batch)
            }).catch(err => console.warn('[tracker] flush failed', err));
        } catch (err) {
            console.warn('[tracker] flush threw', err);
        }
    }

    // ---------- Heartbeat (dwell time ativo) ----------
    let activeMs = 0;
    let lastTick = Date.now();
    let isVisible = !document.hidden;

    function heartbeatTick() {
        const now = Date.now();
        if (isVisible) activeMs += (now - lastTick);
        lastTick = now;
        if (activeMs >= HEARTBEAT_THRESHOLD_MS) {
            enqueue('heartbeat', { delta_seconds: Math.round(activeMs / 1000) });
            activeMs = 0;
        }
    }
    setInterval(heartbeatTick, HEARTBEAT_TICK_MS);

    document.addEventListener('visibilitychange', () => {
        heartbeatTick();
        isVisible = !document.hidden;
        lastTick = Date.now();
        if (document.hidden) flushNow();
    });

    // ---------- Scroll depth (max % alcançado) ----------
    // -1 sentinela: "nunca houve área rolável". Páginas curtas que cabem na
    // viewport não emitem evento de scroll (vide pagehide) — evita inflar a
    // média de scroll com 100% que não significa "leu até o fim".
    let maxScrollPct = -1;
    let scrollPending = false;
    function updateScroll() {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const pct = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
        if (pct > maxScrollPct) maxScrollPct = pct;
    }
    window.addEventListener('scroll', () => {
        if (scrollPending) return;
        scrollPending = true;
        requestAnimationFrame(() => { updateScroll(); scrollPending = false; });
    }, { passive: true });
    updateScroll();

    // ---------- Click tracking ----------
    document.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('[data-track], a[href]');
        if (!el) return;
        const dataLabel = el.dataset && el.dataset.track;
        const href = el.getAttribute('href') || null;
        if (dataLabel) {
            enqueue('cta', { label: dataLabel, href });
        } else if (href) {
            try {
                const url = new URL(href, location.href);
                if (url.host && url.host !== location.host) {
                    enqueue('click', { label: url.host, href: url.href });
                }
            } catch { /* href inválido — ignora */ }
        }
    }, { capture: true, passive: true });

    // ---------- Pageview (inicial + navegação SPA) ----------
    function getUtm() {
        const out = {};
        const params = new URLSearchParams(location.search);
        for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
            const v = params.get(k);
            if (v) out[k] = v;
        }
        return out;
    }

    // Reset scroll-depth quando troca de "página" (SPA): o max_pct deve refletir
    // a leitura do item atual, não o acumulado da sessão.
    let lastPageviewPath = null;
    let firstPageviewSent = false;

    function sendPageview() {
        const path = location.pathname + location.search;
        if (path === lastPageviewPath) return;
        // Antes de mudar de página, emite o scroll do item anterior (se houve área rolável)
        if (lastPageviewPath !== null && maxScrollPct >= 0) {
            enqueue('scroll', { max_pct: maxScrollPct });
        }
        maxScrollPct = -1;
        lastPageviewPath = path;

        const props = {
            lang: navigator.language || null,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
        };
        // referrer/UA só na primeira pageview da sessão de página — evita
        // poluir Top referrers com auto-referências de cada navegação SPA.
        if (!firstPageviewSent) {
            props.referrer = document.referrer || null;
            props.user_agent = (navigator.userAgent || '').slice(0, 500) || null;
            Object.assign(props, getUtm());
            firstPageviewSent = true;
        }
        enqueue('pageview', props);
    }

    // Patch history.pushState/replaceState para detectar navegação SPA.
    // O guia troca o ?item= via pushState quando o modal abre/fecha — sem isso,
    // o tracker só veria a URL de entrada e nada mais.
    const _origPush = history.pushState;
    const _origReplace = history.replaceState;
    history.pushState = function () {
        const ret = _origPush.apply(this, arguments);
        try { sendPageview(); } catch (e) { console.warn('[tracker] pushState pageview', e); }
        return ret;
    };
    history.replaceState = function () {
        const ret = _origReplace.apply(this, arguments);
        try { sendPageview(); } catch (e) { console.warn('[tracker] replaceState pageview', e); }
        return ret;
    };
    window.addEventListener('popstate', sendPageview);

    sendPageview();
    flushNow();

    // ---------- Encerramento ----------
    window.addEventListener('pagehide', () => {
        heartbeatTick();
        if (maxScrollPct >= 0) enqueue('scroll', { max_pct: maxScrollPct });
        flushNow();
    });
})();
