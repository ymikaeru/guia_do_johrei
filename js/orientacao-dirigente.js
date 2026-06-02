/* ============================================================
   js/orientacao-dirigente.js
   ------------------------------------------------------------
   Orientação do Dirigente Espiritual (14/04/1983) — modal de
   áudio público e ESTÁTICO. Botão no header → modal com player
   nativo. Sem login, sem Supabase, sem analytics: é o mesmo áudio
   recomendado no "Caminho da Felicidade", aqui aberto pra qualquer
   visitante do Guia (que é público).

   Para trocar o áudio no futuro: substitua o arquivo em
   assets/audio/orientacao_dirigente_14_04_1983.mp3 (ou ajuste
   AUDIO_URL + o título/data no markup do #orientacaoModal).
   ============================================================ */
(function () {
    'use strict';

    const AUDIO_URL = 'assets/audio/orientacao_dirigente_14_04_1983.mp3';
    // Discriminador no analytics (site_events.props.audio). DEVE ser idêntico ao
    // DIR_AUDIO_KEY do painel admin (caminho: js/admin/tabs/analytics-johrei.js) —
    // é o que separa este áudio do Culto Mensal no dashboard.
    const AUDIO_KEY = 'orientacao_dirigente_1983';
    const SEEN_KEY = 'orientacaoDirigenteSeen'; // localStorage: '1' = usuário já abriu este áudio
    let audioBound = false;

    function getModal() { return document.getElementById('orientacaoModal'); }
    function getAudio() { return document.getElementById('orientacaoAudioEl'); }

    // ── Analytics de escuta (anônimo, via window.mioshieTrack → site_events) ──
    // Espelha o Culto Mensal, mas marca props.audio. Abrir/baixar são cta
    // (data-track no markup), não passam por aqui. Escuta acumula entre
    // segmentos; zera no fechar (close → próxima sessão).
    let playing = false, playStartMs = 0, totalPlayed = 0, durationSec = 0, endedFired = false;

    function track(type, extra) {
        if (typeof window.mioshieTrack !== 'function') return;
        const props = Object.assign({
            audio: AUDIO_KEY,
            duration_seconds: durationSec ? Math.round(durationSec) : null
        }, extra || {});
        try { window.mioshieTrack(type, props); } catch (e) {}
    }
    function onPlay() {
        if (playing) return;
        playing = true; endedFired = false; playStartMs = Date.now();
        const a = getAudio(); if (a && isFinite(a.duration)) durationSec = a.duration;
        track('audio_play', {});
    }
    function onPause() {
        if (!playing) return;
        playing = false;
        totalPlayed += (Date.now() - playStartMs) / 1000;
        track('audio_pause', { total_played_seconds: Math.round(totalPlayed) });
    }
    function onEnded() {
        onPause();
        // Só conta "completa" se chegou de fato ao fim (evita inflar com
        // arrastar-até-o-fim); o admin reconfirma exigindo ≥80% ouvido.
        if (endedFired) return;
        const a = getAudio();
        const reachedEnd = a && isFinite(a.duration) && a.currentTime >= a.duration - 2;
        if (!reachedEnd) return;
        endedFired = true;
        track('audio_ended', { total_played_seconds: Math.round(totalPlayed) });
    }

    function bindAudioOnce() {
        if (audioBound) return;
        const a = getAudio();
        if (!a) return;
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnded);
        a.addEventListener('error', () => alert('Áudio ainda não disponível.'));
        audioBound = true;
    }

    window.openOrientacaoDirigente = function () {
        const modal = getModal();
        if (!modal) return;
        bindAudioOnce();
        const a = getAudio();
        // src lazy: só aponta o mp3 quando o usuário abre o modal (preload
        // metadata busca só o suficiente pra mostrar a duração, não o arquivo).
        if (a && !a.getAttribute('src')) a.setAttribute('src', AUDIO_URL);
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        document.body.classList.add('orient-open');  // apaga/inertiza os botões do header do site
        markDirSeen();                 // abriu → deixa de ser "novo"
        refreshOrientacoesBadge();
    };

    function close() {
        const modal = getModal();
        if (!modal) return;
        const a = getAudio();
        if (a && !a.paused) a.pause();   // pausa o player (dispara 'pause' → no-op depois)
        onPause();                        // flush síncrono do segmento, se estava tocando
        totalPlayed = 0;                  // zera o acumulado pra próxima sessão
        if (typeof window.mioshieFlush === 'function') window.mioshieFlush();
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
        document.body.classList.remove('orient-open');  // reativa os botões do header
    }
    window.closeOrientacaoDirigente = close;

    // ── Badge "novo" do menu "Orientações" (Culto + Dirigente) ──────────────
    // Badge VISÍVEL unificado (#orientacoesBadge) = nº de itens não-vistos. O Culto
    // é rastreado pelo próprio culto-mensal.js via #cultoMensalBadge (mantido como
    // state-holder invisível); o Dirigente por SEEN_KEY. Um MutationObserver no
    // badge do Culto re-sincroniza quando o culto-mensal.js (async) muda o estado.
    function dirUnseen() {
        try { return !localStorage.getItem(SEEN_KEY); } catch (e) { return false; }
    }
    function markDirSeen() {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    }
    function refreshOrientacoesBadge() {
        const holder = document.getElementById('cultoMensalBadge');
        const cultoUnseen = !!holder && !holder.classList.contains('hidden');
        const dUnseen = dirUnseen();
        const count = (cultoUnseen ? 1 : 0) + (dUnseen ? 1 : 0);
        const badge = document.getElementById('orientacoesBadge');
        if (badge) {
            if (count > 0) { badge.textContent = String(count); badge.classList.remove('hidden'); }
            else badge.classList.add('hidden');
        }
        const cultoPill = document.querySelector('[data-orient-pill="culto"]');
        if (cultoPill) cultoPill.classList.toggle('hidden', !cultoUnseen);
        const dirPill = document.querySelector('[data-orient-pill="dirigente"]');
        if (dirPill) dirPill.classList.toggle('hidden', !dUnseen);
    }
    window._refreshOrientacoesBadge = refreshOrientacoesBadge;

    function initOrientacoesBadge() {
        refreshOrientacoesBadge();
        const holder = document.getElementById('cultoMensalBadge');
        if (holder && window.MutationObserver) {
            new MutationObserver(refreshOrientacoesBadge)
                .observe(holder, { attributes: true, attributeFilter: ['class'] });
        }
        // culto-mensal.js checa o badge de forma assíncrona (fetch do MD) —
        // re-sincroniza depois de um tempo como fallback ao observer.
        setTimeout(refreshOrientacoesBadge, 1500);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOrientacoesBadge);
    } else {
        initOrientacoesBadge();
    }

    /* ESC fecha o modal */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modal = getModal();
        if (modal && modal.classList.contains('is-open')) close();
    });
})();
