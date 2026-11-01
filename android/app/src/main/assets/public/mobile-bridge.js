'use strict';

/**
 * Rift Lite Mobile Bridge
 * This intercepts Electron IPC calls and maps them to Mobile WebView actions.
 */
window.electron = {
    send: function(channel, data) {
        console.log(`[Rift Lite] IPC Send: ${channel}`, data);

        if (channel === 'nav') {
            const { action, value } = data;
            const webview = document.getElementById('main-webview');
            if (!webview) return;

            if (action === 'go') {
                // Use the search logic from main.js
                let url = value.trim();
                if (!/^https?:\/\//i.test(url)) {
                    if (!/\s/.test(url) && /^(localhost|\d{1,3}(\.\d{1,3}){3}|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i.test(url)) {
                        url = 'https://' + url;
                    } else {
                        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
                    }
                }
                webview.src = url;
            } else if (action === 'reload') {
                webview.src = webview.src;
            } else if (action === 'back') {
                window.history.back();
            } else if (action === 'forward') {
                window.history.forward();
            }
        }
    },
    invoke: async function(channel, data) {
        console.log(`[Rift Lite] IPC Invoke: ${channel}`, data);

        // Mocking the store for mobile
        if (channel === 'profile:get') {
            return JSON.parse(localStorage.getItem('rift_profile') || '{"name": "Lite User"}');
        }
        if (channel === 'settings:get') {
            return JSON.parse(localStorage.getItem('rift_settings') || '{}');
        }
        return null;
    }
};
