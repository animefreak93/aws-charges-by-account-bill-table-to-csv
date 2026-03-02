// ==UserScript==
// @name         AWS Billing Tree Export to CSV (Accurate Depth + Discounts fix - Hash Safe)
// @namespace    https://chat.openai.com/
// @version      4.1
// @description  Same parsing logic, hash-safe selectors
// @match        https://*.console.aws.amazon.com/billing/home*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ============================
       Utilities
    ============================ */

    function quoteValue(value) {
        if (value === undefined || value === null) return '""';
        const safe = String(value).replace(/"/g, '""').trim();
        return `"${safe}"`;
    }

    function getText(el) {
        return el ? el.innerText.trim() : "";
    }

    /* ============================
       Header Extraction (Hash Safe)
    ============================ */

    function findHeaderValue(labelText) {
    
        // Find all grid columns (hash-safe)
        const gridColumns = document.querySelectorAll('div[class^="awsui_grid-column_"]');
    
        for (const col of gridColumns) {
    
            // Label is inside awsui_root_* div
            const labelDiv = col.querySelector('div[class^="awsui_root_"]');
            const valueH3 = col.querySelector("h3");
    
            if (!labelDiv || !valueH3) continue;
    
            if (labelDiv.innerText.trim().includes(labelText)) {
                return valueH3.innerText.trim();
            }
        }
    
        return "";
    }

    /* ============================
       Account Label
    ============================ */

    function getAccountLabelTrimmed() {
        const el = document.querySelector('[data-testid="account-label"]');
        if (!el) return "unknown";

        let text = el.textContent.trim();
        text = text.replace(/\s*\(.*?\)/, "");
        text = text.replace(/\s+/g, "_");
        text = text.replace(/[^A-Za-z0-9_-]/g, "");

        return text || "unknown";
    }

    /* ============================
       Parse Table (Same Logic)
    ============================ */

    function parseTable() {

        // ORIGINAL behavior preserved:
        // Only rows that contain awsui_row_
        const rows = document.querySelectorAll('tbody tr[class^="awsui_row_"]');

        const data = [];
        const levels = ["", "", "", "", "", ""];

        rows.forEach(row => {

            const firstCell = row.querySelector("td");
            if (!firstCell) return;

            /* -------- Depth detection (UNCHANGED) -------- */

            const treeLines = firstCell.querySelectorAll("svg.related-table-tree-line");
            let depth = 1;

            if (treeLines.length > 0) {
                const lastSvg = treeLines[treeLines.length - 1];
                const viewBox = lastSvg.getAttribute?.("viewBox") || "";
                const styleHeight = lastSvg.style?.height || "";
                const attrHeight = lastSvg.getAttribute?.("height") || "";
                const heightHasPercent = styleHeight.includes("%") || attrHeight.includes("%");

                if (viewBox.includes("0 0 2 100") || heightHasPercent) {
                    depth = 1;
                } else if (lastSvg.style?.inset) {
                    const match = lastSvg.style.inset.match(/(\d+)rem/);
                    if (match) {
                        const indentRem = parseInt(match[1], 10);
                        depth = Math.min(Math.round(indentRem / 2) + 1, 6);
                    } else {
                        depth = Math.min(treeLines.length, 6);
                    }
                } else {
                    depth = Math.min(treeLines.length, 6);
                }
            }

            /* -------- Description (Hash Safe, Same Meaning) -------- */

            const descriptionDiv =
                firstCell.querySelector('[class^="awsui_root_"]') ||
                firstCell.querySelector("div");

            const description = getText(descriptionDiv);

            /* -------- Usage + Amount (UNCHANGED) -------- */

            const allCells = row.querySelectorAll("td");

            let usageQty = getText(allCells[allCells.length - 2]);
            let amountUSD = getText(allCells[allCells.length - 1]);

            amountUSD = amountUSD.replace(/USD\s*/g, "").trim();
            if (amountUSD === "") amountUSD = "0";

            /* -------- Special Handling (UNCHANGED) -------- */

            if (description === "Solution Provider Program Discounts") {
                levels[3] = "";
                levels[4] = description;
                levels[5] = description;
                usageQty = description;

            } else if (description === "Service Tax to be collected") {
                levels[2] = description;
                levels[3] = "Any";
                levels[4] = description;
                levels[5] = description;
                usageQty = description;

            } else {
                levels[depth - 1] = description;
                for (let i = depth; i < levels.length; i++) {
                    levels[i] = "";
                }
            }

            data.push([
                levels[0],
                levels[1],
                levels[2],
                levels[3],
                levels[4],
                levels[5],
                usageQty,
                amountUSD
            ]);
        });

        return data;
    }

    /* ============================
       CSV Builder
    ============================ */

    function convertToCSV(data) {
        const header = [
            "Account ID",
            "Amazon Company Name",
            "Service Name",
            "Region",
            "Service Detail",
            "Charge Rate Detail",
            "Usage Quantity",
            "Amount in USD"
        ];

        const lines = [header.map(quoteValue).join(",")];
        data.forEach(row => lines.push(row.map(quoteValue).join(",")));
        return lines.join("\n");
    }

    /* ============================
       Filename
    ============================ */

    function getFileName() {
        const accountLabel = getAccountLabelTrimmed();
        const headerAccountID = findHeaderValue("Account ID") || "unknown";
        const billingPeriodRaw = findHeaderValue("Billing period") || "";

        const billingPeriod = billingPeriodRaw
            .replace(/\s+/g, "_")
            .replace(/[^0-9A-Za-z_-]/g, "");

        return `${accountLabel}_aws_billing_${headerAccountID}_${billingPeriod}.csv`;
    }

    /* ============================
       Download
    ============================ */

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    /* ============================
       Button
    ============================ */

    const btn = document.createElement("button");
    btn.innerText = "⬇ Export AWS Table to CSV";

    Object.assign(btn.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        background: "#0073bb",
        color: "white",
        border: "none",
        padding: "10px 16px",
        borderRadius: "6px",
        cursor: "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        fontWeight: "bold",
        fontFamily: '"Amazon Ember", Arial, sans-serif'
    });

    btn.addEventListener("click", () => {
        const data = parseTable();
        if (data.length === 0) {
            alert("⚠️ No rows found. Make sure the billing table is visible.");
            return;
        }
        const csv = convertToCSV(data);
        const filename = getFileName();
        downloadFile(csv, filename);
    });

    document.body.appendChild(btn);

})();
