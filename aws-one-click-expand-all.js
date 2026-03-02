// ==UserScript==
// @name         AWS Billing Tree Expander (v3.9 - Safe Live with Popup Text)
// @namespace    https://aws.amazon.com/
// @version      3.9
// @description  Expand/collapse AWS billing tree safely with live status updates, always-visible floating popup, batch clicks, and spinner.
// @match        https://*.aws.amazon.com/billing/home*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    // ---------- Spinner ----------
    const spinnerStyle = document.createElement("style");
    spinnerStyle.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg);}
            100% { transform: rotate(360deg);}
        }
    `;
    document.head.appendChild(spinnerStyle);

    function addSpinner(textSpan) {
        const spinner = document.createElement("span");
        Object.assign(spinner.style, {
            display: "inline-block",
            width: "12px",
            height: "12px",
            marginLeft: "6px",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTop: "2px solid white",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            verticalAlign: "middle",
        });
        textSpan.appendChild(spinner);
        return spinner;
    }

    // ---------- Custom Button ----------
    const css = document.createElement("style");
    css.textContent = `
        .expand-button-custom {
            background-color: #0073bb;
            color: white;
            border: none;
            padding: 6px 12px;
            margin-left: 8px;
            border-radius: 6px;
            font-size: 13px;
            font-family: '"Amazon Ember", Arial, sans-serif',
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.15s ease-in-out;
            user-select: none;
        }
        .expand-button-custom:hover:enabled {
            background-color: #005f99;
        }
        .expand-button-custom:disabled {
            opacity: 0.5;
            cursor: default;
        }
    `;
    document.head.appendChild(css);

    // ---------- Centered Status Box ----------
    const statusDiv = document.createElement("div");
    Object.assign(statusDiv.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "#0073bb",
        color: "white",
        padding: "10px 20px",
        borderRadius: "8px",
        fontSize: "14px",
        fontFamily: '"Amazon Ember", Arial, sans-serif',
        zIndex: "999999",
        pointerEvents: "none",
        display: "none",
    });
    document.body.appendChild(statusDiv);

    // ---------- Preload First Level ----------
    async function preloadFirstLevel() {
        const btns = Array.from(
            document.querySelectorAll('button[aria-label="Expand item"]')
        ).filter((b) => b.closest("tr") && !b.closest("tr").parentElement.closest("tr"));

        for (const b of btns) {
            b.click();
            await wait(250);
        }
        await wait(500);
    }

    // ---------- Safe Live Expand ----------
    async function expandAllSafe() {
        statusDiv.style.display = "block";
        statusDiv.textContent = "Expanding…";

        const table = document.querySelector('[role="table"]');
        const observer = new MutationObserver(() => {
            const remaining = document.querySelectorAll('button[aria-label="Expand item"]').length;
            statusDiv.textContent = `Expanding… ${remaining} items left`;
        });

        if (table) observer.observe(table, { childList: true, subtree: true });

        let btns = Array.from(document.querySelectorAll('button[aria-label="Expand item"]'));
        while (btns.length > 0) {
            statusDiv.textContent = `Expanding… ${btns.length} items left`;
            btns.forEach((b) => b.click());
            await wait(250);
            btns = Array.from(document.querySelectorAll('button[aria-label="Expand item"]'));
        }

        observer.disconnect();
        statusDiv.textContent = "✅ All expanded";
        await wait(1200);
        statusDiv.style.display = "none";
    }

    // ---------- Safe Live Collapse ----------
    async function collapseAllSafe() {
        statusDiv.style.display = "block";
        statusDiv.textContent = "Collapsing…";

        const table = document.querySelector('[role="table"]');
        const observer = new MutationObserver(() => {
            const remaining = document.querySelectorAll('button[aria-label="Collapse item"]').length;
            statusDiv.textContent = `Collapsing… ${remaining} items left`;
        });

        if (table) observer.observe(table, { childList: true, subtree: true });
        
        let btns = Array.from(document.querySelectorAll('button[aria-label="Collapse item"]'));
        while (btns.length > 0) {
            statusDiv.textContent = `Collapsing… ${btns.length} items left`;
            btns.slice(0, 3).forEach((b) => b.click());
            await wait(10);
            btns = Array.from(document.querySelectorAll('button[aria-label="Collapse item"]'));
        }

        observer.disconnect();
        statusDiv.textContent = "✅ All collapsed";
        await wait(1200);
        statusDiv.style.display = "none";
    }

    // ---------- Standalone Button ----------
    const dynamicBtn = document.createElement("button");
    dynamicBtn.className = "expand-button-custom";
    dynamicBtn.textContent = "+ Expand all";
    dynamicBtn.dataset.state = "collapsed";

    dynamicBtn.addEventListener("click", async () => {
        dynamicBtn.disabled = true;

        if (dynamicBtn.dataset.state === "collapsed") {
            dynamicBtn.textContent = "Expanding...";
            const spinner = addSpinner(dynamicBtn);

            await preloadFirstLevel();
            await expandAllSafe();

            spinner.remove();
            dynamicBtn.textContent = "− Collapse all";
            dynamicBtn.dataset.state = "expanded";
        } else {
            dynamicBtn.textContent = "Collapsing...";
            const spinner = addSpinner(dynamicBtn);
            await wait(100);
            await collapseAllSafe();

            spinner.remove();
            dynamicBtn.textContent = "+ Expand all";
            dynamicBtn.dataset.state = "collapsed";
        }

        dynamicBtn.disabled = false;
    });

    // ---------- Find Action Bar ----------
    function findActionBar(panel) {
        const gearBtn = panel.querySelector(
            'button[aria-label="Settings"], ' +
            'button[aria-label="Actions"], ' +
            'button[data-analytics*="settings"], ' +
            'button svg[viewBox="0 0 16 16"]'
        );
        return gearBtn?.closest("div") || null;
    }

    // ---------- Inject Button ----------
    const observerTabs = new MutationObserver(() => {
        const activePanel = Array.from(document.querySelectorAll('[role="tabpanel"]')).find(
            (p) =>
                p.offsetParent !== null &&
                p.querySelector("h2 span")?.textContent.includes("Charges by account")
        );

        if (!activePanel) {
            if (dynamicBtn.parentElement) dynamicBtn.remove();
            return;
        }

        const actionBar = findActionBar(activePanel);
        if (actionBar && !actionBar.contains(dynamicBtn)) {
            actionBar.appendChild(dynamicBtn);
            console.log("Injected Expand/Collapse button.");
        }
    });

    observerTabs.observe(document.body, { childList: true, subtree: true });
})(); 
