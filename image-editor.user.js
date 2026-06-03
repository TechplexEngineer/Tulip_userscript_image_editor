// ==UserScript==
// @name         Tulip App Editor - Advanced Image Editor Suite (v13.0)
// @namespace    http://tampermonkey.net/
// @version      13.0
// @description  Added robust State History Engine (Undo/Redo), keyboard shortcuts, input safeties, and contextual styling tools.
// @author       Blake Bourque
// @match        https://*.tulip.co/apps/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      amazonaws.com
// @connect      blob.core.windows.net
// ==/UserScript==

(function() {
    'use strict';

    // Premium UI Overhaul Styling
    GM_addStyle(`
        .tulip-integrated-crop-row { padding: 4px 16px 12px 16px; display: flex; flex-direction: column; }
        .tulip-integrated-crop-btn {
            background: #ffffff; color: #1d212a; border: 1px solid #ced4da; padding: 6px 12px;
            border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; text-align: center;
            transition: background 0.15s, border-color 0.15s; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .tulip-integrated-crop-btn:hover:not(:disabled) { background: #f8f9fa; border-color: #b5bbc1; }
        .tulip-integrated-crop-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; border-color: #cbd5e1; }
        
        #tulip-image-suite-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.75); z-index: 999999; display: flex;
            flex-direction: column; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .tulip-suite-window {
            background: white; padding: 24px; border-radius: 8px;
            display: flex; flex-direction: column; max-width: 95vw; max-height: 95vh;
            box-shadow: 0 20px 50px rgba(0,0,0,0.4);
        }
        
        .tulip-suite-toolbar {
            display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 20px;
            background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; flex-wrap: wrap; row-gap: 12px;
        }
        .suite-tool-btn {
            background: white; border: 1px solid #cbd5e1; padding: 8px 14px;
            border-radius: 4px; font-size: 12px; font-weight: 600; color: #475569;
            cursor: pointer; display: flex; flex-direction: column; align-items: center;
            gap: 4px; min-width: 65px; transition: all 0.15s ease;
        }
        .suite-tool-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; }
        .suite-tool-btn:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
        .suite-tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .suite-tool-btn.active { background: #0066cc; color: white; border-color: #0052a3; }
        
        .toolbar-divider { width: 1px; height: 32px; background: #e2e8f0; margin: 0 8px; }
        .style-control-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
        .style-group { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
        .style-group-row { display: flex; align-items: center; gap: 4px; }
        .suite-color-input { width: 28px; height: 24px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; padding: 0; background: none; }
        .suite-hex-input { width: 60px; height: 24px; padding: 2px 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace; }
        .suite-number-input { height: 24px; width: 45px; padding: 2px 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 600; color: #334155; text-align: center; }
        .suite-range-input { width: 60px; cursor: pointer; }
        .suite-select-input { height: 24px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; padding: 0 4px; color: #334155; }

        .tulip-suite-workspace {
            position: relative; overflow: auto; background: #232731;
            border-radius: 4px; height: 60vh; width: 85vw;
            display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        #tulip-canvas-stack-wrapper { position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        #tulip-source-canvas { display: block; max-width: 100%; max-height: 60vh; }
        #tulip-markup-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        
        #tulip-suite-cropbox {
            position: absolute; border: 2px dashed #0066cc;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
            cursor: move; box-sizing: border-box; display: none;
        }
        .crop-corner-handle { position: absolute; width: 20px; height: 20px; background: #0066cc; border: 2px solid white; border-radius: 50%; }
        .handle-se { bottom: -11px; right: -11px; cursor: se-resize; }

        .tulip-suite-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
        .suite-hint-badge { font-size: 13px; color: #64748b; font-weight: 500; background: #f1f5f9; padding: 8px 14px; border-radius: 4px; }
        .suite-action-group { display: flex; gap: 12px; }
        .suite-btn { padding: 10px 22px; font-size: 14px; font-weight: 600; border: none; border-radius: 4px; cursor: pointer; }
        .suite-btn-cancel { background: #e2e8f0; color: #334155; }
        .suite-btn-confirm { background: #0066cc; color: white; }
    `);

    function injectPNGMetadata(blob, key, value) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const buffer = e.target.result; const view = new DataView(buffer); const bytes = new Uint8Array(buffer);
                if (view.getUint32(0) !== 0x89504E47) { resolve(blob); return; }
                const keyBytes = new TextEncoder().encode(key); const valBytes = new TextEncoder().encode(value);
                const chunkLength = keyBytes.length + 1 + valBytes.length;
                const chunkBytes = new Uint8Array(12 + chunkLength); const chunkView = new DataView(chunkBytes.buffer);
                chunkView.setUint32(0, chunkLength);
                chunkBytes[4] = 116; chunkBytes[5] = 69; chunkBytes[6] = 88; chunkBytes[7] = 116;
                chunkBytes.set(keyBytes, 8); chunkBytes[8 + keyBytes.length] = 0; chunkBytes.set(valBytes, 9 + keyBytes.length);
                let crc = 0xFFFFFFFF;
                for (let i = 4; i < 8 + chunkLength; i++) { crc ^= chunkBytes[i]; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); }
                chunkView.setUint32(8 + chunkLength, crc ^ 0xFFFFFFFF);
                resolve(new Blob([bytes.subarray(0, bytes.length - 12), chunkBytes, bytes.subarray(bytes.length - 12)], { type: "image/png" }));
            };
            reader.readAsArrayBuffer(blob);
        });
    }

    function extractPNGMetadata(blob, key) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const buffer = e.target.result; const view = new DataView(buffer);
                if (view.getUint32(0) !== 0x89504E47) { resolve(null); return; }
                let idx = 8; const decoder = new TextDecoder();
                while (idx < buffer.byteLength) {
                    const length = view.getUint32(idx);
                    const type = decoder.decode(new Uint8Array(buffer, idx + 4, 4));
                    if (type === "tEXt") {
                        const dataBytes = new Uint8Array(buffer, idx + 8, length); const nullPos = dataBytes.indexOf(0);
                        if (decoder.decode(dataBytes.subarray(0, nullPos)) === key) { resolve(decoder.decode(dataBytes.subarray(nullPos + 1))); return; }
                    }
                    if (type === "IEND") break;
                    idx += 12 + length;
                }
                resolve(null);
            };
            reader.readAsArrayBuffer(blob);
        });
    }

    const observer = new MutationObserver(() => {
        const textNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let resetRatioNode = null;
        while (textNodes.nextNode()) {
            if (textNodes.currentNode.nodeValue.trim() === "Reset aspect ratio") { resetRatioNode = textNodes.currentNode; break; }
        }
        if (resetRatioNode) {
            const resetRowContainer = resetRatioNode.parentElement.closest('div');
            if (resetRowContainer && !document.getElementById('tulip-integrated-crop-container')) { injectSuiteButton(resetRowContainer); }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function injectSuiteButton(siblingRow) {
        const container = document.createElement('div');
        container.id = 'tulip-integrated-crop-container';
        container.className = 'tulip-integrated-crop-row';

        const btn = document.createElement('button');
        btn.className = 'tulip-integrated-crop-btn';
        btn.innerText = 'Edit & Crop Selected Image';
        
        container.appendChild(btn);
        siblingRow.parentNode.insertBefore(container, siblingRow.nextSibling);

        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            btn.disabled = true;
            btn.innerText = '⏳ Loading...';

            const sidebarPanel = siblingRow.closest('[class*="Sidebar"]') || document.body;
            let fileInput = sidebarPanel.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');

            let assetIdentifier = ""; let extractedUrl = null;
            const allSidebarElements = sidebarPanel.querySelectorAll('*');
            
            for (let el of allSidebarElements) {
                let txt = el.value || el.innerText || el.textContent || "";
                if (txt.includes('http') && (txt.includes('amazonaws.com') || txt.includes('blob.core.windows.net') || txt.includes('tulip.co'))) {
                    try {
                        const urlMatch = txt.match(/https?:\/\/[^\s"']+/);
                        if (urlMatch) {
                            const urlObj = new URL(urlMatch[0]);
                            assetIdentifier = urlObj.pathname.split('/').filter(Boolean).pop();
                            if (assetIdentifier) break;
                        }
                    } catch(err) {}
                }
            }

            if (assetIdentifier) {
                const liveImages = document.querySelectorAll('img');
                for (let img of liveImages) {
                    if (img.src && img.src.includes(assetIdentifier)) { extractedUrl = img.src; break; }
                }
            }

            if (extractedUrl && fileInput) {
                openImageSuiteWindow(extractedUrl, btn, fileInput);
            } else {
                btn.disabled = false; btn.innerText = 'Edit & Crop Selected Image';
                alert("Please select the image widget again. (ID missing)");
            }
        });
    }

    function openImageSuiteWindow(targetUrl, sidebarBtn, targetFileInput) {
        GM_xmlhttpRequest({
            method: "GET", url: targetUrl, responseType: "blob",
            onload: function(response) {
                sidebarBtn.disabled = false; sidebarBtn.innerText = 'Edit & Crop Selected Image';
                if (response.status === 200) {
                    const blobData = response.response;
                    extractPNGMetadata(blobData, "TulipVectorSuiteState").then((savedJSONState) => {
                        let parsedState = savedJSONState ? JSON.parse(savedJSONState) : null;
                        const reader = new FileReader();
                        reader.onloadend = function() {
                            const currentDataUrl = reader.result;
                            const pristineSourceDataUrl = (parsedState && parsedState.originalImgData) ? parsedState.originalImgData : currentDataUrl;
                            const img = new Image();
                            img.onload = function() { initializeSuiteInterface(img, parsedState, pristineSourceDataUrl, targetFileInput); };
                            img.src = pristineSourceDataUrl;
                        };
                        reader.readAsDataURL(blobData);
                    });
                }
            },
            onerror: function() { sidebarBtn.disabled = false; sidebarBtn.innerText = 'Edit & Crop Selected Image'; }
        });
    }

    function hexToRgba(hex, opacity) {
        let h = hex.replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    }

    function initializeSuiteInterface(sourceImg, parsedState, pristineSourceDataUrl, targetFileInput) {
        const overlay = document.createElement('div');
        overlay.id = 'tulip-image-suite-overlay';
        overlay.innerHTML = `
            <div class="tulip-suite-window">
                <div class="tulip-suite-toolbar">
                    <button class="suite-tool-btn active" data-mode="select"><svg viewBox="0 0 24 24"><path d="M5 3l7 14 3-5 5 3z" fill="currentColor" stroke="none"/></svg>Select</button>
                    <button class="suite-tool-btn" data-mode="crop"><svg viewBox="0 0 24 24"><path d="M6 2v16h16M2 6h16v16" stroke-linecap="round" stroke-linejoin="round"/></svg>Crop</button>
                    <button class="suite-tool-btn" data-mode="arrow"><svg viewBox="0 0 24 24"><path d="M5 19L19 5M19 5H10M19 5V14" stroke-linecap="round" stroke-linejoin="round"/></svg>Arrow</button>
                    <button class="suite-tool-btn" data-mode="line"><svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5" stroke-linecap="round"/></svg>Line</button>
                    <button class="suite-tool-btn" data-mode="text"><svg viewBox="0 0 24 24"><path d="M4 7V4h16v3M12 4v16M9 20h6" stroke-linecap="round"/></svg>Text</button>
                    <button class="suite-tool-btn" data-mode="rect"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round"/></svg>Square</button>
                    <button class="suite-tool-btn" data-mode="circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>Circle</button>
                    
                    <div class="toolbar-divider"></div>
                    
                    <button class="suite-tool-btn" id="suite-undo" title="Undo (Ctrl+Z)" disabled><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" stroke-linecap="round" stroke-linejoin="round"/></svg>Undo</button>
                    <button class="suite-tool-btn" id="suite-redo" title="Redo (Ctrl+Y)" disabled><svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" stroke-linecap="round" stroke-linejoin="round"/></svg>Redo</button>
                    
                    <div class="toolbar-divider" id="suite-main-divider" style="display: none;"></div>
                    
                    <div id="suite-line-controls" style="display: none; align-items: center; gap: 8px;">
                        <div class="style-group">
                            <div class="style-control-label">Line Color</div>
                            <div class="style-group-row">
                                <input type="color" id="suite-stroke-picker" class="suite-color-input" value="#ef4444">
                                <input type="text" id="suite-stroke-hex" class="suite-hex-input" value="#ef4444">
                                <input type="range" id="suite-stroke-opacity" class="suite-range-input" min="0" max="100" value="100" title="Line Opacity">
                                <span style="font-size:10px; color:#64748b; min-width: 25px;" id="suite-stroke-op-val">100%</span>
                            </div>
                        </div>
                        <div class="style-group" style="margin-left: 8px;">
                            <div class="style-control-label">Thickness</div>
                            <div class="style-group-row">
                                <input type="number" id="suite-stroke-width" class="suite-number-input" min="1" max="100" value="6">
                                <span style="font-size:10px; color:#64748b;">px</span>
                            </div>
                        </div>
                        <div class="toolbar-divider"></div>
                    </div>

                    <div id="suite-fill-controls" style="display: none; align-items: center; gap: 8px;">
                        <div class="style-group">
                            <div class="style-control-label">Fill Color</div>
                            <div class="style-group-row">
                                <input type="color" id="suite-fill-picker" class="suite-color-input" value="#0066cc">
                                <input type="text" id="suite-fill-hex" class="suite-hex-input" value="#0066cc">
                                <input type="range" id="suite-fill-opacity" class="suite-range-input" min="0" max="100" value="0" title="Fill Opacity">
                                <span style="font-size:10px; color:#64748b; min-width: 25px;" id="suite-fill-op-val">0%</span>
                            </div>
                        </div>
                        <div class="toolbar-divider"></div>
                    </div>

                    <div id="suite-text-controls" style="display: none; align-items: center; gap: 8px;">
                        <div class="style-group">
                            <div class="style-control-label">Text Format</div>
                            <div class="style-group-row">
                                <select id="suite-font-family" class="suite-select-input">
                                    <option value="sans-serif">Sans-Serif</option>
                                    <option value="serif">Serif</option>
                                    <option value="monospace">Monospace</option>
                                    <option value="Arial">Arial</option>
                                    <option value="'Courier New'">Courier New</option>
                                    <option value="'Times New Roman'">Times</option>
                                </select>
                                <input type="number" id="suite-font-size" class="suite-number-input" min="8" max="250" value="32" title="Font Size">
                                <span style="font-size:10px; color:#64748b;">px</span>
                            </div>
                        </div>
                        <div class="style-group" style="margin-left: 8px;">
                            <div class="style-control-label">Text Color</div>
                            <div class="style-group-row">
                                <input type="color" id="suite-text-picker" class="suite-color-input" value="#ef4444">
                                <input type="text" id="suite-text-hex" class="suite-hex-input" value="#ef4444">
                                <input type="range" id="suite-text-opacity" class="suite-range-input" min="0" max="100" value="100" title="Text Opacity">
                                <span style="font-size:10px; color:#64748b; min-width: 25px;" id="suite-text-op-val">100%</span>
                            </div>
                        </div>
                        <div class="toolbar-divider"></div>
                    </div>

                </div>
                <div class="tulip-suite-workspace">
                    <div id="tulip-canvas-stack-wrapper">
                        <canvas id="tulip-source-canvas"></canvas>
                        <canvas id="tulip-markup-canvas"></canvas>
                        <div id="tulip-suite-cropbox"><div class="crop-corner-handle handle-se" id="handle-resize"></div></div>
                    </div>
                </div>
                <div class="tulip-suite-footer">
                    <div class="suite-hint-badge" id="suite-hint-text">🖱️ Selection Mode: Click any shape to edit. Press <b>Delete</b> to remove.</div>
                    <div class="suite-action-group">
                        <button class="suite-btn suite-btn-cancel" id="suite-cancel">Cancel</button>
                        <button class="suite-btn suite-btn-confirm" id="suite-confirm">Save</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const canvas = document.getElementById('tulip-source-canvas');
        const ctx = canvas.getContext('2d');
        const markupCanvas = document.getElementById('tulip-markup-canvas');
        const markupCtx = markupCanvas.getContext('2d');
        const cropBox = document.getElementById('tulip-suite-cropbox');
        const wrapper = document.getElementById('tulip-canvas-stack-wrapper');
        
        const mainDivider = document.getElementById('suite-main-divider');
        const lineControls = document.getElementById('suite-line-controls');
        const fillControls = document.getElementById('suite-fill-controls');
        const textControls = document.getElementById('suite-text-controls');
        const undoBtn = document.getElementById('suite-undo');
        const redoBtn = document.getElementById('suite-redo');

        const strokePicker = document.getElementById('suite-stroke-picker');
        const strokeHex = document.getElementById('suite-stroke-hex');
        const strokeOp = document.getElementById('suite-stroke-opacity');
        const strokeOpVal = document.getElementById('suite-stroke-op-val');
        const strokeWidthEl = document.getElementById('suite-stroke-width');
        
        const fillPicker = document.getElementById('suite-fill-picker');
        const fillHex = document.getElementById('suite-fill-hex');
        const fillOp = document.getElementById('suite-fill-opacity');
        const fillOpVal = document.getElementById('suite-fill-op-val');

        const fontFamEl = document.getElementById('suite-font-family');
        const fontSizeEl = document.getElementById('suite-font-size');
        const textPicker = document.getElementById('suite-text-picker');
        const textHex = document.getElementById('suite-text-hex');
        const textOp = document.getElementById('suite-text-opacity');
        const textOpVal = document.getElementById('suite-text-op-val');

        canvas.width = sourceImg.naturalWidth; canvas.height = sourceImg.naturalHeight;
        markupCanvas.width = sourceImg.naturalWidth; markupCanvas.height = sourceImg.naturalHeight;
        ctx.drawImage(sourceImg, 0, 0);

        const imageAspectRatio = sourceImg.naturalWidth / sourceImg.naturalHeight;
        let boxGeom = { left: 0, top: 0, width: canvas.width, height: canvas.height };
        let currentMode = 'select'; 
        
        let annotations = [];
        if (parsedState && parsedState.vectors) {
            annotations = parsedState.vectors.map(v => {
                if (v.color && !v.strokeColor) { v.strokeColor = v.color; v.strokeOpacity = 100; v.fillOpacity = 0; }
                return v;
            });
        }
        
        let selectedAnno = null, currentAnno = null;
        let activeStrokeColor = "#ef4444", activeStrokeOp = 100, activeThickness = 6;
        let activeFillColor = "#0066cc", activeFillOp = 0; 
        let activeFontFamily = "sans-serif", activeFontSize = 32, activeTextColor = "#ef4444", activeTextOp = 100;
        
        let isTransforming = false, activeTransformHandle = null;
        let startMouseX, startMouseY, startLeft, startTop, startWidth, startHeight, startX, startY;
        let isDragging = false, isResizing = false, isDrawing = false;

        // --- HISTORY ENGINE (UNDO/REDO) ---
        let history = [];
        let historyStep = -1;

        function saveState() {
            if (historyStep < history.length - 1) { history = history.slice(0, historyStep + 1); }
            history.push({
                annotations: JSON.parse(JSON.stringify(annotations)),
                boxGeom: JSON.parse(JSON.stringify(boxGeom))
            });
            historyStep++;
            updateUndoRedoUI();
        }

        function undo() {
            if (historyStep > 0) {
                historyStep--;
                restoreState(history[historyStep]);
            }
        }

        function redo() {
            if (historyStep < history.length - 1) {
                historyStep++;
                restoreState(history[historyStep]);
            }
        }

        function restoreState(state) {
            annotations = JSON.parse(JSON.stringify(state.annotations));
            boxGeom = JSON.parse(JSON.stringify(state.boxGeom));
            selectedAnno = null; // Clear selection safety
            updateCropUI();
            updateToolbarVisibility();
            renderVectors();
            updateUndoRedoUI();
        }

        function updateUndoRedoUI() {
            undoBtn.disabled = historyStep <= 0;
            redoBtn.disabled = historyStep >= history.length - 1;
        }

        undoBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); undo(); });
        redoBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); redo(); });
        // ----------------------------------

        function updateToolbarVisibility() {
            let activeType = currentMode;
            if (currentMode === 'select') { activeType = selectedAnno ? selectedAnno.type : 'none'; }

            lineControls.style.display = 'none'; fillControls.style.display = 'none';
            textControls.style.display = 'none'; mainDivider.style.display = 'none';

            if (activeType === 'line' || activeType === 'arrow') {
                lineControls.style.display = 'flex'; mainDivider.style.display = 'block';
            } else if (activeType === 'rect' || activeType === 'circle') {
                lineControls.style.display = 'flex'; fillControls.style.display = 'flex'; mainDivider.style.display = 'block';
            } else if (activeType === 'text') {
                textControls.style.display = 'flex'; mainDivider.style.display = 'block';
            }
        }

        function updateCropUI() {
            cropBox.style.left = boxGeom.left + 'px'; cropBox.style.top = boxGeom.top + 'px';
            cropBox.style.width = boxGeom.width + 'px'; cropBox.style.height = boxGeom.height + 'px';
        }

        if (parsedState && parsedState.cropSettings) {
            boxGeom = parsedState.cropSettings;
            cropBox.style.display = 'block';
            document.querySelectorAll('.suite-tool-btn').forEach(b => {
                if (b.getAttribute('data-mode') === 'crop') b.classList.add('active'); else b.classList.remove('active');
            });
            currentMode = 'crop';
        }

        setTimeout(() => {
            if (!parsedState || !parsedState.cropSettings) {
                boxGeom.left = 0; boxGeom.top = 0; boxGeom.width = wrapper.clientWidth; boxGeom.height = wrapper.clientHeight;
                if (canvas.height > wrapper.clientHeight || canvas.width > wrapper.clientWidth) {
                    const renderRatio = Math.min(wrapper.clientWidth / canvas.width, wrapper.clientHeight / canvas.height);
                    boxGeom.width = canvas.width * renderRatio; boxGeom.height = canvas.height * renderRatio;
                    boxGeom.left = (wrapper.clientWidth - boxGeom.width)/2; boxGeom.top = (wrapper.clientHeight - boxGeom.height)/2;
                }
            }
            updateCropUI();
            updateToolbarVisibility();
            saveState(); // Commit Base State Layout Start
        }, 50);

        function renderVectors() {
            markupCtx.clearRect(0, 0, markupCanvas.width, markupCanvas.height);
            markupCtx.lineCap = 'round';
            annotations.forEach(a => {
                markupCtx.save();
                markupCtx.translate(a.cx, a.cy);
                markupCtx.rotate(a.rotation || 0);
                
                markupCtx.strokeStyle = hexToRgba(a.strokeColor || '#ef4444', a.strokeOpacity !== undefined ? a.strokeOpacity : 100);
                markupCtx.fillStyle = hexToRgba(a.fillColor || '#0066cc', a.fillOpacity !== undefined ? a.fillOpacity : 0);
                markupCtx.lineWidth = a.thickness || 6;

                const w = a.width, h = a.height;

                if (a.type === 'line' || a.type === 'arrow') {
                    const head = a.type === 'arrow' ? markupCtx.lineWidth * 4 : 0;
                    const shaftEnd = a.type === 'arrow' ? (w/2 - head/2) : w/2;
                    
                    markupCtx.beginPath(); markupCtx.moveTo(-w/2, 0); markupCtx.lineTo(shaftEnd, 0); markupCtx.stroke();
                    
                    if (a.type === 'arrow') {
                        markupCtx.fillStyle = markupCtx.strokeStyle;
                        markupCtx.beginPath(); markupCtx.moveTo(w/2, 0);
                        markupCtx.lineTo(w/2 - head, -head / 1.7); markupCtx.lineTo(w/2 - head, head / 1.7);
                        markupCtx.closePath(); markupCtx.fill();
                    }
                } else if (a.type === 'rect') {
                    markupCtx.beginPath(); markupCtx.rect(-w/2, -h/2, w, h); 
                    if (a.fillOpacity > 0) markupCtx.fill();
                    if (a.strokeOpacity > 0 || a.thickness > 0) markupCtx.stroke();
                } else if (a.type === 'circle') {
                    markupCtx.beginPath(); markupCtx.arc(0, 0, Math.abs(w/2), 0, 2 * Math.PI); 
                    if (a.fillOpacity > 0) markupCtx.fill();
                    if (a.strokeOpacity > 0 || a.thickness > 0) markupCtx.stroke();
                } else if (a.type === 'text') {
                    const fontSize = a.fontSize || Math.max(16, canvas.width / 45); 
                    const fontFamily = a.fontFamily || 'sans-serif';
                    markupCtx.font = `bold ${fontSize}px ${fontFamily}`;
                    
                    const tColor = a.textColor || a.strokeColor || '#ef4444';
                    const tOp = a.textOpacity !== undefined ? a.textOpacity : (a.strokeOpacity !== undefined ? a.strokeOpacity : 100);
                    markupCtx.fillStyle = hexToRgba(tColor, tOp);
                    
                    markupCtx.textBaseline = 'middle';
                    markupCtx.fillText(a.text, -w/2, 0);
                }
                
                if (a === selectedAnno) {
                    markupCtx.strokeStyle = '#0066cc'; markupCtx.lineWidth = 2; markupCtx.setLineDash([4, 3]);
                    markupCtx.strokeRect(-w/2 - 6, -h/2 - 6, w + 12, h + 12);
                    markupCtx.beginPath(); markupCtx.moveTo(0, -h/2 - 6); markupCtx.lineTo(0, -h/2 - 26); markupCtx.stroke();
                    markupCtx.fillStyle = '#0066cc'; markupCtx.setLineDash([]);
                    markupCtx.beginPath(); markupCtx.arc(0, -h/2 - 26, 9, 0, 2 * Math.PI); markupCtx.fill();
                    
                    const pts = { nw: [-w/2-6, -h/2-6], n: [0, -h/2-6], ne: [w/2+6, -h/2-6], e: [w/2+6, 0], se: [w/2+6, h/2+6], s: [0, h/2+6], sw: [-w/2-6, h/2+6], w: [-w/2-6, 0] };
                    for (let p in pts) {
                        markupCtx.fillStyle = 'white'; markupCtx.strokeStyle = '#0066cc'; markupCtx.lineWidth = 2;
                        markupCtx.fillRect(pts[p][0] - 9, pts[p][1] - 9, 18, 18); markupCtx.strokeRect(pts[p][0] - 9, pts[p][1] - 9, 18, 18);
                    }
                }
                markupCtx.restore();
            });

            if (currentAnno) {
                markupCtx.save();
                markupCtx.strokeStyle = hexToRgba(currentAnno.strokeColor, currentAnno.strokeOpacity);
                markupCtx.fillStyle = hexToRgba(currentAnno.fillColor, currentAnno.fillOpacity);
                markupCtx.lineWidth = currentAnno.thickness;
                markupCtx.beginPath();
                if (currentAnno.type === 'line' || currentAnno.type === 'arrow') {
                    const head = currentAnno.type === 'arrow' ? markupCtx.lineWidth * 4 : 0;
                    const angle = Math.atan2(currentAnno.y2 - currentAnno.y1, currentAnno.x2 - currentAnno.x1); 
                    const pullBack = currentAnno.type === 'arrow' ? head / 2 : 0;
                    const shaftEndX = currentAnno.x2 - pullBack * Math.cos(angle); const shaftEndY = currentAnno.y2 - pullBack * Math.sin(angle);
                    
                    markupCtx.moveTo(currentAnno.x1, currentAnno.y1); markupCtx.lineTo(shaftEndX, shaftEndY); markupCtx.stroke();
                    
                    if (currentAnno.type === 'arrow') {
                        markupCtx.fillStyle = markupCtx.strokeStyle;
                        markupCtx.beginPath(); markupCtx.moveTo(currentAnno.x2, currentAnno.y2);
                        markupCtx.lineTo(currentAnno.x2 - head * Math.cos(angle - Math.PI/6), currentAnno.y2 - head * Math.sin(angle - Math.PI/6));
                        markupCtx.lineTo(currentAnno.x2 - head * Math.cos(angle + Math.PI/6), currentAnno.y2 - head * Math.sin(angle + Math.PI/6));
                        markupCtx.closePath(); markupCtx.fill();
                    }
                } else if (currentAnno.type === 'rect') {
                    markupCtx.rect(currentAnno.x1, currentAnno.y1, currentAnno.x2 - currentAnno.x1, currentAnno.y2 - currentAnno.y1); 
                    if (currentAnno.fillOpacity > 0) markupCtx.fill();
                    if (currentAnno.strokeOpacity > 0 || currentAnno.thickness > 0) markupCtx.stroke();
                } else if (currentAnno.type === 'circle') {
                    const r = Math.sqrt(Math.pow(currentAnno.x2 - currentAnno.x1, 2) + Math.pow(currentAnno.y2 - currentAnno.y1, 2));
                    markupCtx.arc(currentAnno.x1, currentAnno.y1, r, 0, 2 * Math.PI); 
                    if (currentAnno.fillOpacity > 0) markupCtx.fill();
                    if (currentAnno.strokeOpacity > 0 || currentAnno.thickness > 0) markupCtx.stroke();
                }
                markupCtx.restore();
            }
        }
        renderVectors();

        function syncStylesToSelected() {
            if (selectedAnno) {
                selectedAnno.strokeColor = activeStrokeColor; selectedAnno.strokeOpacity = activeStrokeOp;
                selectedAnno.thickness = activeThickness;
                selectedAnno.fillColor = activeFillColor; selectedAnno.fillOpacity = activeFillOp;
                selectedAnno.fontFamily = activeFontFamily; selectedAnno.fontSize = activeFontSize;
                selectedAnno.textColor = activeTextColor; selectedAnno.textOpacity = activeTextOp;
                
                if (selectedAnno.type === 'text') {
                    markupCtx.font = `bold ${activeFontSize}px ${activeFontFamily}`;
                    const m = markupCtx.measureText(selectedAnno.text);
                    selectedAnno.width = m.width; selectedAnno.height = activeFontSize;
                }
                renderVectors();
            }
        }

        const triggerSave = () => { if (selectedAnno) saveState(); };

        strokePicker.addEventListener('input', (e) => { activeStrokeColor = e.target.value; strokeHex.value = activeStrokeColor; syncStylesToSelected(); });
        strokeHex.addEventListener('input', (e) => { activeStrokeColor = e.target.value; strokePicker.value = activeStrokeColor; syncStylesToSelected(); });
        strokeOp.addEventListener('input', (e) => { activeStrokeOp = parseInt(e.target.value); strokeOpVal.innerText = activeStrokeOp + '%'; syncStylesToSelected(); });
        strokeWidthEl.addEventListener('input', (e) => { if(e.target.value) { activeThickness = parseInt(e.target.value); syncStylesToSelected(); } });
        
        strokePicker.addEventListener('change', triggerSave); strokeHex.addEventListener('change', triggerSave); 
        strokeOp.addEventListener('change', triggerSave); strokeWidthEl.addEventListener('change', triggerSave);

        fillPicker.addEventListener('input', (e) => { activeFillColor = e.target.value; fillHex.value = activeFillColor; syncStylesToSelected(); });
        fillHex.addEventListener('input', (e) => { activeFillColor = e.target.value; fillPicker.value = activeFillColor; syncStylesToSelected(); });
        fillOp.addEventListener('input', (e) => { activeFillOp = parseInt(e.target.value); fillOpVal.innerText = activeFillOp + '%'; syncStylesToSelected(); });

        fillPicker.addEventListener('change', triggerSave); fillHex.addEventListener('change', triggerSave); fillOp.addEventListener('change', triggerSave);

        fontFamEl.addEventListener('input', (e) => { activeFontFamily = e.target.value; syncStylesToSelected(); });
        fontSizeEl.addEventListener('input', (e) => { if(e.target.value) { activeFontSize = parseInt(e.target.value); syncStylesToSelected(); } });
        textPicker.addEventListener('input', (e) => { activeTextColor = e.target.value; textHex.value = activeTextColor; syncStylesToSelected(); });
        textHex.addEventListener('input', (e) => { activeTextColor = e.target.value; textPicker.value = activeTextColor; syncStylesToSelected(); });
        textOp.addEventListener('input', (e) => { activeTextOp = parseInt(e.target.value); textOpVal.innerText = activeTextOp + '%'; syncStylesToSelected(); });

        fontFamEl.addEventListener('change', triggerSave); fontSizeEl.addEventListener('change', triggerSave);
        textPicker.addEventListener('change', triggerSave); textHex.addEventListener('change', triggerSave); textOp.addEventListener('change', triggerSave);


        const handleGlobalKeypress = (e) => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT';
            
            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault(); e.stopPropagation();
                if (e.shiftKey) redo(); else undo();
                return;
            }
            if (!isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault(); e.stopPropagation();
                redo(); return;
            }
            if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault(); e.stopPropagation(); 
                if (selectedAnno) { 
                    annotations = annotations.filter(item => item !== selectedAnno); 
                    selectedAnno = null; 
                    updateToolbarVisibility(); renderVectors(); saveState();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeypress, true);

        document.querySelectorAll('.suite-tool-btn').forEach(btn => {
            if (btn.id === 'suite-undo' || btn.id === 'suite-redo') return;
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); e.preventDefault();
                document.querySelectorAll('.suite-tool-btn:not(#suite-undo):not(#suite-redo)').forEach(b => b.classList.remove('active'));
                btn.classList.add('active'); currentMode = btn.getAttribute('data-mode');
                if (currentMode !== 'select') selectedAnno = null;
                cropBox.style.display = (currentMode === 'crop') ? 'block' : 'none'; 
                updateToolbarVisibility(); renderVectors();
            });
        });

        const handleMouseDown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
            const nx = (e.clientX - rect.left) * scaleX, ny = (e.clientY - rect.top) * scaleY;
            
            if (currentMode === 'select') {
                if (selectedAnno) {
                    const cx = selectedAnno.cx, cy = selectedAnno.cy, w = selectedAnno.width, h = selectedAnno.height, rot = selectedAnno.rotation || 0;
                    const cos = Math.cos(-rot), sin = Math.sin(-rot);
                    const localX = (nx - cx) * cos - (ny - cy) * sin;
                    const localY = (nx - cx) * sin + (ny - cy) * cos;

                    if (Math.abs(localX) < 18 && Math.abs(localY - (-h/2 - 26)) < 18) {
                        isTransforming = true; activeTransformHandle = 'rotate';
                        startMouseX = nx; startMouseY = ny; startHeight = rot; return;
                    }

                    const pts = { nw: [-w/2-6, -h/2-6], n: [0, -h/2-6], ne: [w/2+6, -h/2-6], e: [w/2+6, 0], se: [w/2+6, h/2+6], s: [0, h/2+6], sw: [-w/2-6, h/2+6], w: [-w/2-6, 0] };
                    for (let p in pts) {
                        if (Math.abs(localX - pts[p][0]) < 18 && Math.abs(localY - pts[p][1]) < 18) {
                            isTransforming = true; activeTransformHandle = p; startMouseX = nx; startMouseY = ny;
                            startWidth = w; startHeight = h; startLeft = cx; startTop = cy; return;
                        }
                    }

                    if (Math.abs(localX) < w/2 + 10 && Math.abs(localY) < h/2 + 10) {
                        isTransforming = true; activeTransformHandle = 'move';
                        startMouseX = nx; startMouseY = ny; startLeft = cx; startTop = cy; return;
                    }
                }

                let matched = null;
                for (let i = annotations.length - 1; i >= 0; i--) {
                    const a = annotations[i];
                    const cos = Math.cos(-a.rotation), sin = Math.sin(-a.rotation);
                    const lx = (nx - a.cx) * cos - (ny - a.cy) * sin;
                    const ly = (nx - a.cx) * sin + (ny - a.cy) * cos;
                    if (Math.abs(lx) < a.width/2 + 15 && Math.abs(ly) < a.height/2 + 15) { matched = a; break; }
                }

                selectedAnno = matched;
                if (selectedAnno) {
                    activeStrokeColor = selectedAnno.strokeColor || "#ef4444";
                    activeStrokeOp = selectedAnno.strokeOpacity !== undefined ? selectedAnno.strokeOpacity : 100;
                    activeThickness = selectedAnno.thickness || 6;
                    activeFillColor = selectedAnno.fillColor || "#0066cc";
                    activeFillOp = selectedAnno.fillOpacity !== undefined ? selectedAnno.fillOpacity : 0;
                    activeFontFamily = selectedAnno.fontFamily || "sans-serif";
                    activeFontSize = selectedAnno.fontSize || 32;
                    activeTextColor = selectedAnno.textColor || selectedAnno.strokeColor || "#ef4444";
                    activeTextOp = selectedAnno.textOpacity !== undefined ? selectedAnno.textOpacity : (selectedAnno.strokeOpacity !== undefined ? selectedAnno.strokeOpacity : 100);
                    
                    strokePicker.value = activeStrokeColor; strokeHex.value = activeStrokeColor;
                    strokeOp.value = activeStrokeOp; strokeOpVal.innerText = activeStrokeOp + "%";
                    strokeWidthEl.value = activeThickness;
                    fillPicker.value = activeFillColor; fillHex.value = activeFillColor;
                    fillOp.value = activeFillOp; fillOpVal.innerText = activeFillOp + "%";
                    fontFamEl.value = activeFontFamily; fontSizeEl.value = activeFontSize;
                    textPicker.value = activeTextColor; textHex.value = activeTextColor;
                    textOp.value = activeTextOp; textOpVal.innerText = activeTextOp + "%";

                    isTransforming = true; activeTransformHandle = 'move';
                    startMouseX = nx; startMouseY = ny; startLeft = selectedAnno.cx; startTop = selectedAnno.cy;
                }
                updateToolbarVisibility(); renderVectors(); return;
            } else if (currentMode === 'crop') {
                if (e.target.id === 'handle-resize') {
                    isResizing = true; startX = e.clientX; startY = e.clientY; startWidth = boxGeom.width; startHeight = boxGeom.height;
                    e.stopPropagation(); e.preventDefault();
                } else {
                    isDragging = true; startX = e.clientX; startY = e.clientY; startLeft = boxGeom.left; startTop = boxGeom.top;
                    e.preventDefault();
                }
            } else {
                if (currentMode === 'text') {
                    const txt = prompt("Enter text markup:");
                    if (txt) {
                        markupCtx.font = `bold ${activeFontSize}px ${activeFontFamily}`;
                        const m = markupCtx.measureText(txt);
                        annotations.push({ 
                            type: 'text', cx: nx, cy: ny, width: m.width, height: activeFontSize, text: txt, 
                            strokeColor: activeStrokeColor, strokeOpacity: activeStrokeOp, thickness: activeThickness, 
                            fillColor: activeFillColor, fillOpacity: activeFillOp,
                            fontFamily: activeFontFamily, fontSize: activeFontSize, textColor: activeTextColor, textOpacity: activeTextOp,
                            rotation: 0 
                        });
                        renderVectors(); saveState();
                    }
                } else {
                    isDrawing = true; 
                    currentAnno = { 
                        type: currentMode, x1: nx, y1: ny, x2: nx, y2: ny, 
                        strokeColor: activeStrokeColor, strokeOpacity: activeStrokeOp, thickness: activeThickness,
                        fillColor: activeFillColor, fillOpacity: activeFillOp
                    };
                }
            }
        };

        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
            const nx = Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX));
            const ny = Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY));

            if (isTransforming && selectedAnno) {
                const dx = nx - startMouseX, dy = ny - startMouseY;
                if (activeTransformHandle === 'move') {
                    selectedAnno.cx = startLeft + dx; selectedAnno.cy = startTop + dy;
                } else if (activeTransformHandle === 'rotate') {
                    selectedAnno.rotation = startHeight + Math.atan2(ny - selectedAnno.cy, nx - selectedAnno.cx) - Math.atan2(startMouseY - selectedAnno.cy, startMouseX - selectedAnno.cx);
                } else {
                    const rot = selectedAnno.rotation || 0;
                    const cos = Math.cos(-rot), sin = Math.sin(-rot);
                    const ldx = dx * cos - dy * sin, ldy = dx * sin + dy * cos;
                    
                    let deltaW = 0, deltaH = 0;
                    if (activeTransformHandle.includes('e')) deltaW = ldx;
                    if (activeTransformHandle.includes('w')) deltaW = -ldx;
                    if (activeTransformHandle.includes('s')) deltaH = ldy;
                    if (activeTransformHandle.includes('n')) deltaH = -ldy;

                    const newWidth = Math.max(20, startWidth + deltaW);
                    const newHeight = Math.max(20, startHeight + deltaH);

                    const actualDeltaW = newWidth - startWidth;
                    const actualDeltaH = newHeight - startHeight;

                    let localShiftX = 0, localShiftY = 0;
                    if (activeTransformHandle.includes('e')) localShiftX = actualDeltaW / 2;
                    if (activeTransformHandle.includes('w')) localShiftX = -actualDeltaW / 2;
                    if (activeTransformHandle.includes('s')) localShiftY = actualDeltaH / 2;
                    if (activeTransformHandle.includes('n')) localShiftY = -actualDeltaH / 2;

                    selectedAnno.width = newWidth; selectedAnno.height = newHeight;
                    selectedAnno.cx = startLeft + (localShiftX * Math.cos(rot) - localShiftY * Math.sin(rot));
                    selectedAnno.cy = startTop + (localShiftX * Math.sin(rot) + localShiftY * Math.cos(rot));
                }
                renderVectors();
            } else if (isDrawing && currentAnno) {
                currentAnno.x2 = nx; currentAnno.y2 = ny; renderVectors();
            } else if (isDragging) {
                boxGeom.left = Math.max(0, Math.min(wrapper.clientWidth - boxGeom.width, startLeft + (e.clientX - startX)));
                boxGeom.top = Math.max(0, Math.min(wrapper.clientHeight - boxGeom.height, startTop + (e.clientY - startY)));
                updateCropUI();
            } else if (isResizing) {
                let targetW = startWidth + (e.clientX - startX);
                let targetH = e.shiftKey ? (targetW / imageAspectRatio) : (startHeight + (e.clientY - startY));
                if (boxGeom.left + targetW > wrapper.clientWidth) targetW = wrapper.clientWidth - boxGeom.left;
                if (boxGeom.top + targetH > wrapper.clientHeight) targetH = wrapper.clientHeight - boxGeom.top;
                if (targetW > 30 && targetH > 30) { boxGeom.width = targetW; boxGeom.height = targetH; }
                updateCropUI();
            }
        };

        const handleMouseUp = () => {
            let stateChanged = false;
            
            if (currentAnno && isDrawing) {
                if (currentAnno.type === 'line' || currentAnno.type === 'arrow') {
                    const cx = (currentAnno.x1 + currentAnno.x2) / 2; const cy = (currentAnno.y1 + currentAnno.y2) / 2;
                    const len = Math.sqrt(Math.pow(currentAnno.x2 - currentAnno.x1, 2) + Math.pow(currentAnno.y2 - currentAnno.y1, 2));
                    const angle = Math.atan2(currentAnno.y2 - currentAnno.y1, currentAnno.x2 - currentAnno.x1);
                    if (len > 5) annotations.push({ 
                        type: currentAnno.type, cx: cx, cy: cy, width: len, height: 10, 
                        strokeColor: currentAnno.strokeColor, strokeOpacity: currentAnno.strokeOpacity, thickness: currentAnno.thickness,
                        fillColor: currentAnno.fillColor, fillOpacity: currentAnno.fillOpacity, rotation: angle 
                    });
                } else {
                    const cx = (currentAnno.x1 + currentAnno.x2) / 2; const cy = (currentAnno.y1 + currentAnno.y2) / 2;
                    const w = Math.abs(currentAnno.x2 - currentAnno.x1); const h = Math.abs(currentAnno.y2 - currentAnno.y1);
                    if (w > 5 || h > 5) annotations.push({ 
                        type: currentAnno.type, cx: cx, cy: cy, width: w, height: h, 
                        strokeColor: currentAnno.strokeColor, strokeOpacity: currentAnno.strokeOpacity, thickness: currentAnno.thickness,
                        fillColor: currentAnno.fillColor, fillOpacity: currentAnno.fillOpacity, rotation: 0 
                    });
                }
                currentAnno = null; stateChanged = true; renderVectors();
            }
            
            if (isTransforming || isDragging || isResizing) stateChanged = true;

            isDragging = false; isResizing = false; isDrawing = false; isTransforming = false; activeTransformHandle = null;
            if (stateChanged) saveState();
        };

        wrapper.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        const cleanUpModal = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); } 
            window.removeEventListener('keydown', handleGlobalKeypress, true);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            setTimeout(() => { overlay.remove(); }, 10);
        };

        document.getElementById('suite-cancel').addEventListener('click', cleanUpModal);
        document.getElementById('suite-cancel').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });

        document.getElementById('suite-confirm').addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            selectedAnno = null; renderVectors();
            const masterBlendedCanvas = document.createElement('canvas');
            masterBlendedCanvas.width = canvas.width; masterBlendedCanvas.height = canvas.height;
            const masterCtx = masterBlendedCanvas.getContext('2d');
            masterCtx.drawImage(canvas, 0, 0); masterCtx.drawImage(markupCanvas, 0, 0);
            
            let finalUploadCanvas = masterBlendedCanvas;
            if (currentMode === 'crop') {
                const scaleX = canvas.width / wrapper.clientWidth, scaleY = canvas.height / wrapper.clientHeight;
                const cropW = boxGeom.width * scaleX, cropH = boxGeom.height * scaleY;
                finalUploadCanvas = document.createElement('canvas');
                finalUploadCanvas.width = cropW; finalUploadCanvas.height = cropH;
                const finalCtx = finalUploadCanvas.getContext('2d');
                finalCtx.drawImage(masterBlendedCanvas, boxGeom.left * scaleX, boxGeom.top * scaleY, cropW, cropH, 0, 0, cropW, cropH);
            }

            finalUploadCanvas.toBlob((flatBlob) => {
                const metadata = { vectors: annotations, originalImgData: pristineSourceDataUrl, cropSettings: (currentMode === 'crop' ? boxGeom : null) };
                injectPNGMetadata(flatBlob, "TulipVectorSuiteState", JSON.stringify(metadata)).then((metaBlob) => {
                    const file = new File([metaBlob], "annotated_asset.png", { type: "image/png" });
                    const dataTransfer = new DataTransfer(); dataTransfer.items.add(file);
                    if (targetFileInput) {
                        targetFileInput.files = dataTransfer.files; targetFileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        cleanUpModal();
                    }
                });
            }, 'image/png');
        });
    }
})();
