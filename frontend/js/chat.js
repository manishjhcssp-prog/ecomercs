'use strict';

(function () {
    // Inject widget HTML
    const widgetHTML = `
    <div id="nova-chat-widget">
      <div id="nova-chat-window">
        <div id="nova-chat-header">
          <h3>✨ AI Personal Shopper</h3>
          <button id="nova-chat-close">&times;</button>
        </div>
        <div id="nova-chat-body">
          <!-- Chat messages go here -->
        </div>
        <form id="nova-chat-footer">
          <input type="text" id="nova-chat-input" placeholder="Ask me something..." autocomplete="off" required>
          <button type="submit" id="nova-chat-send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </form>
      </div>
      <button id="nova-chat-toggle" aria-label="Open AI Chat">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
  `;
    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const toggleBtn = document.getElementById('nova-chat-toggle');
    const chatWindow = document.getElementById('nova-chat-window');
    const closeBtn = document.getElementById('nova-chat-close');
    const chatForm = document.getElementById('nova-chat-footer');
    const chatInput = document.getElementById('nova-chat-input');
    const chatBody = document.getElementById('nova-chat-body');

    let history = [];

    // Restore history from sessionStorage so it survives page reloads
    function loadHistory() {
        try {
            const saved = sessionStorage.getItem('nova_chat_history');
            if (saved) {
                history = JSON.parse(saved);
                history.forEach(msg => {
                    if (msg.role !== 'system' && msg.role !== 'tool') {
                        appendMsgUI(msg.content, msg.role === 'user' ? 'user' : 'ai', false);
                    }
                });
                chatWindow.classList.add('open'); // Keep it open across page loads if active
            } else {
                // Initial greeting if no history
                appendMsgUI("Hi there! 👋 I'm your AI Shopper.<br/><br/>I can help you find products, check prices, and add items straight to your cart. What are you looking for today?", 'ai', false);
            }
        } catch (e) { console.error('Failed to load chat history', e); }
    }

    function saveHistory() {
        sessionStorage.setItem('nova_chat_history', JSON.stringify(history));
    }

    toggleBtn.addEventListener('click', () => {
        chatWindow.classList.toggle('open');
        if (chatWindow.classList.contains('open')) {
            chatInput.focus();
            sessionStorage.setItem('nova_chat_open', 'true');
        } else {
            sessionStorage.setItem('nova_chat_open', 'false');
        }
    });

    closeBtn.addEventListener('click', () => {
        chatWindow.classList.remove('open');
        sessionStorage.setItem('nova_chat_open', 'false');
    });

    // Restore open state
    if (sessionStorage.getItem('nova_chat_open') === 'true') {
        chatWindow.classList.add('open');
    }

    function appendMsgUI(text, type, escape = true) {
        const div = document.createElement('div');
        div.className = `chat-msg ${type}`;
        let formatted = escape ? escapeHTML(text) : text;
        if (escape) {
            formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            formatted = formatted.replace(/\n/g, '<br>');
        }
        div.innerHTML = formatted;
        chatBody.appendChild(div);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }

    function appendLoader() {
        const div = document.createElement('div');
        div.className = 'chat-msg ai loader';
        div.innerHTML = 'Thinking<span style="animation: pulse 1s infinite">...</span>';
        div.id = 'chat-loader';
        chatBody.appendChild(div);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function removeLoader() {
        const loader = document.getElementById('chat-loader');
        if (loader) loader.remove();
    }

    // Load history immediately
    loadHistory();

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
            chatWindow.classList.remove('open');
            if (typeof promptLogin === 'function') {
                promptLogin('Please log in (or create an account) to chat with the AI Shopper.');
            } else {
                alert('Please log in to chat with the AI Shopper.');
            }
            return;
        }

        appendMsgUI(text, 'user', true);
        chatInput.value = '';

        history.push({ role: 'user', content: text });
        saveHistory();
        appendLoader();

        try {
            const res = await api('/ai/chat', {
                method: 'POST',
                body: { messages: history },
                auth: true
            });

            removeLoader();
            if (res.success && res.data) {
                let aiRespContent = res.data.content || "Done!";
                appendMsgUI(aiRespContent, 'ai', true);
                history.push(res.data);
                saveHistory();

                if (aiRespContent.toLowerCase().includes('cart') && typeof refreshCartFromServer === 'function') {
                    refreshCartFromServer().catch(console.error);
                }

                // Handle Automatic Redirection if AI triggered checkout
                if (res.redirect === 'checkout') {
                    setTimeout(() => {
                        if (typeof storePage === 'function') {
                            window.location.assign(storePage('checkout.html'));
                        }
                    }, 1500); // give the user time to read the message
                }

            } else {
                appendMsgUI('Oops, something went wrong on our end.', 'ai', true);
            }
        } catch (err) {
            removeLoader();
            if (err.message && err.message.toLowerCase().includes('authoriz')) {
                appendMsgUI('Your session has expired. Please log out and log back in to use the AI Shopper!', 'ai', true);
            } else {
                appendMsgUI('Sorry, I am having trouble connecting to the AI provider right now.', 'ai', true);
            }
            console.error('AI Chat Error:', err);
        }
    });

})();
