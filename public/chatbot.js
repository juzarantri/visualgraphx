/*<script src="http://localhost:3000/chatbot.js" data-iframe="http://localhost:3000/embed"></script>
 */

/*
optional: open the widget immediately
<script>
 window.VGXChat?.open?.();</script>
*/
(function () {
  if (window.VGXChat && window.VGXChat.__loaded) return;

  const DEFAULT_STYLES = `
  .vgx-chat-bubble { position: fixed; right: 24px; bottom: 24px; width: 64px; height: 64px; border-radius: 999px; background: linear-gradient(135deg,#3b82f6 0%,#06b6d4 100%); box-shadow: 0 8px 24px rgba(2,6,23,0.2); display:flex;align-items:center;justify-content:center;color:white;font-weight:700;cursor:pointer;z-index:2147483646 }
  .vgx-chat-iframe-wrap { position: fixed; right: 24px; bottom: 100px; width: 380px; height: 560px; box-shadow: 0 12px 40px rgba(2,6,23,0.3); border-radius: 12px; overflow: hidden; z-index:2147483646; transform-origin: bottom right; transition: transform 180ms ease, opacity 180ms ease; }
  .vgx-chat-iframe-wrap.hidden { transform: scale(0.9); opacity: 0; pointer-events: none }
  .vgx-chat-iframe { width:100%; height:100%; border:0; background:transparent }
  `;

  const doc = document;
  // We'll create and append DOM nodes once the document is ready. That lets the
  // snippet be placed in the document <head> without causing null appendChild errors.
  let bubble = null;
  let iframeWrap = null;

  function ensureDOMNodes() {
    // append style to head if present, otherwise to documentElement
    const style = doc.createElement("style");
    style.textContent = DEFAULT_STYLES;
    const head =
      doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement;
    head.appendChild(style);

    // create UI nodes (created early but iframe is lazy)
    bubble = doc.createElement("button");
    bubble.className = "vgx-chat-bubble";
    bubble.setAttribute("aria-label", "Open chat");
    bubble.title = "Open chat";
    bubble.innerText = "Chat";

    iframeWrap = doc.createElement("div");
    iframeWrap.className = "vgx-chat-iframe-wrap hidden";
    iframeWrap.setAttribute("role", "dialog");
    iframeWrap.setAttribute("aria-label", "Chat widget");

    const body =
      doc.body ||
      (function () {
        try {
          return doc.getElementsByTagName("body")[0];
        } catch (e) {
          return null;
        }
      })();
    if (body) {
      body.appendChild(iframeWrap);
      body.appendChild(bubble);
    } else {
      // if body is still not available, wait for DOMContentLoaded to append
      doc.addEventListener("DOMContentLoaded", function onLoad() {
        doc.removeEventListener("DOMContentLoaded", onLoad);
        const b = doc.body || doc.getElementsByTagName("body")[0];
        if (b) {
          b.appendChild(iframeWrap);
          b.appendChild(bubble);
        }
      });
    }

    // wire up events now that nodes exist
    bubble.addEventListener("click", function (e) {
      e.preventDefault();
      if (!open) show();
      else hide();
    });
  }

  if (doc.readyState === "complete" || doc.readyState === "interactive") {
    ensureDOMNodes();
  } else {
    doc.addEventListener("DOMContentLoaded", ensureDOMNodes);
  }

  let iframe = null;
  let open = false;
  let config = {
    iframeUrl: window.location.origin + "/embed",
    // allow the host to set the parent origin value; if null, we use the caller origin at init
    parentOrigin: null,
    autoOpen: false,
  };

  function createIframe() {
    if (!iframeWrap || !bubble) {
      // ensure nodes exist before creating iframe
      if (doc.readyState === "complete" || doc.readyState === "interactive") {
        if (!iframeWrap || !bubble) ensureDOMNodes();
      }
    }
    if (iframe) return iframe;
    iframe = doc.createElement("iframe");
    iframe.className = "vgx-chat-iframe";
    iframe.allow = "clipboard-read; clipboard-write;";
    iframe.src = config.iframeUrl;
    iframeWrap.appendChild(iframe);

    // After iframe loads, do a handshake so the embed page knows the parent origin.
    iframe.addEventListener("load", function () {
      try {
        const parentOrigin = config.parentOrigin || window.location.origin;
        // target the iframe origin when sending handshake if possible
        var iframeOrigin;
        try {
          iframeOrigin = new URL(config.iframeUrl).origin;
        } catch (e) {
          iframeOrigin = "*";
        }
        iframe.contentWindow?.postMessage(
          { type: "vgx:handshake", parentOrigin: parentOrigin },
          iframeOrigin
        );
        // use '*' because child may be cross-origin; child should record ev.origin of handshake
      } catch (e) {
        // best-effort
      }
    });

    return iframe;
  }

  function show() {
    if (!iframe) createIframe();
    if (iframeWrap) iframeWrap.classList.remove("hidden");
    if (bubble) {
      bubble.setAttribute("aria-label", "Close chat");
      bubble.title = "Close chat";
    }
    open = true;
  }

  function hide() {
    if (iframeWrap) iframeWrap.classList.add("hidden");
    if (bubble) {
      bubble.setAttribute("aria-label", "Open chat");
      bubble.title = "Open chat";
    }
    open = false;
  }

  // Click outside to close — guard until nodes created
  function onDocClick(ev) {
    if (!open) return;
    const target = ev.target;
    if (bubble && target === bubble) return;
    if (iframeWrap && iframeWrap.contains && iframeWrap.contains(target))
      return;
    hide();
  }
  document.addEventListener("click", onDocClick);

  // Message handling: accept only messages from the iframe origin recorded by the iframe during handshake.
  let childOrigin = null;

  window.addEventListener("message", function (ev) {
    const data = ev.data || {};

    // The child will reply with handshake:ack; record child's origin
    if (data.type === "vgx:handshake:ack") {
      childOrigin = ev.origin;
      return;
    }

    // Only accept vgx:* runtime control messages from the recorded child origin.
    if (childOrigin && ev.origin !== childOrigin) return;

    if (data.type === "vgx:open") {
      show();
      // forward focus
      if (iframe && iframe.contentWindow)
        iframe.contentWindow.postMessage(
          { type: "vgx:focus" },
          childOrigin || "*"
        );
    }
    if (data.type === "vgx:close") {
      hide();
    }
  });

  // Expose a small API window.VGXChat
  window.VGXChat = {
    __loaded: true,
    init: function (opts) {
      opts = opts || {};
      if (opts.iframeUrl) config.iframeUrl = opts.iframeUrl;
      if (opts.parentOrigin) config.parentOrigin = opts.parentOrigin;
      if (opts.autoOpen) config.autoOpen = true;
      return this;
    },
    open: function () {
      if (!iframeWrap || !bubble) {
        if (doc.readyState === "complete" || doc.readyState === "interactive")
          ensureDOMNodes();
        else {
          // wait until DOM ready then open
          return doc.addEventListener("DOMContentLoaded", function onLoad() {
            doc.removeEventListener("DOMContentLoaded", onLoad);
            window.VGXChat.open();
          });
        }
      }
      show();
      // focus the input inside iframe if already ready
      if (iframe && iframe.contentWindow)
        iframe.contentWindow.postMessage({ type: "vgx:focus" }, "*");
    },
    close: function () {
      hide();
    },
    focus: function () {
      if (iframe && iframe.contentWindow)
        iframe.contentWindow.postMessage({ type: "vgx:focus" }, "*");
    },
  };

  // Auto-initialize from the script tag's data attributes so host pages only need to
  // drop a single script tag. Supported attributes on the script tag:
  //   data-iframe="https://your-app.example.com/embed" (optional)
  //   data-auto-open="1" (optional)
  try {
    var currentScript = document.currentScript;
    if (!currentScript) {
      // fallback: find last script that includes chatbot.js
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var s = scripts[i];
        if (s.src && s.src.indexOf("chatbot.js") !== -1) {
          currentScript = s;
          break;
        }
      }
    }

    if (currentScript) {
      var dataIframe = currentScript.getAttribute("data-iframe");
      var dataAuto = currentScript.getAttribute("data-auto-open");
      if (dataIframe) config.iframeUrl = dataIframe;
      else {
        // infer iframe host from the script src origin
        try {
          var srcUrl = new URL(currentScript.src);
          config.iframeUrl = srcUrl.origin + "/embed";
        } catch (e) {
          // leave default
        }
      }
      if (dataAuto === "1" || dataAuto === "true") config.autoOpen = true;
    }
  } catch (e) {
    // ignore
  }

  // If autoOpen configured, open after a microtask so page can finish loading
  if (config.autoOpen)
    setTimeout(function () {
      window.VGXChat.open();
    }, 50);
})();
