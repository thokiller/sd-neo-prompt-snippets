(() => {
    const STORAGE_KEY = "forge_prompt_snippets_v1";
    const STYLE_ID = "forge-prompt-snippet-style";
    const TOOLBAR_CLASS = "forge-prompt-snippet-toolbar";
    const MENU_CLASS = "forge-prompt-snippet-menu";
    const POPOVER_CLASS = "forge-prompt-snippet-popover";
    const DENSITY_OPT_KEY = "forge_prompt_snippets_ui_density";
    const DENSITY_COMPACT = "compact";
    const DENSITY_COMFORTABLE = "comfortable";
    const THUMBNAIL_OPT_KEY = "forge_prompt_snippets_thumbnail_source";
    const THUMBNAIL_ALWAYS = "always use latest generation thumbnail";
    const THUMBNAIL_ASK = "ask before using latest generation thumbnail";
    const THUMBNAIL_NEVER = "never auto-use it";
    const THUMBNAIL_STORAGE_MAX_SIZE = 256;

    const FIELD_MAP = [
        { id: "txt2img_prompt", type: "positive", label: "T2I Positive" },
        { id: "txt2img_neg_prompt", type: "negative", label: "T2I Negative" },
        { id: "img2img_prompt", type: "positive", label: "I2I Positive" },
        { id: "img2img_neg_prompt", type: "negative", label: "I2I Negative" },
    ];

    function loadSnippets() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn("Prompt snippets: failed to parse storage", err);
            return [];
        }
    }

    function saveSnippets(snippets) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    }

    function normalizeText(text) {
        return (text || "").replace(/\s+/g, " ").trim();
    }

    function preserveSnippetText(text) {
        // Keep user punctuation (including leading/trailing commas) and only normalize line breaks.
        return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }
    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
            reader.readAsDataURL(file);
        });
    }
    
    function resizeImageDataUrl(dataUrl, maxSize = 96) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const longestSide = Math.max(image.width, image.height) || 1;
                const scale = Math.min(1, maxSize / longestSide);
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) {
                    reject(new Error("Could not create canvas context."));
                    return;
                }

                context.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL("image/png"));
            };
            image.onerror = () => reject(new Error("Could not decode image."));
            image.src = dataUrl;
        });
    }
    
    async function fileToThumbnailDataUrl(file) {
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl.startsWith("data:image/")) {
            throw new Error("Selected file is not an image.");
        }
        return resizeImageDataUrl(dataUrl, THUMBNAIL_STORAGE_MAX_SIZE);
    }

    function pickThumbnailFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.style.display = "none";
            document.body.appendChild(input);

            input.addEventListener("change", async () => {
                const file = input.files && input.files[0];
                if (!file) {
                    input.remove();
                    resolve("");
                    return;
                }

                try {
                    const thumbnail = await fileToThumbnailDataUrl(file);
                    resolve(thumbnail);
                } catch (err) {
                    reject(err);
                } finally {
                    input.remove();
                }
            });

            input.click();
        });
    }

    async function srcToDataUrl(src) {
        if (!src) return "";
        if (src.startsWith("data:image/")) return src;

        const response = await fetch(src, { credentials: "same-origin" });
        if (!response.ok) {
            throw new Error("Could not load image from the gallery.");
        }

        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("Could not read image data."));
            reader.readAsDataURL(blob);
        });
    }

    async function getLatestGalleryThumbnailDataUrl() {
        const galleryImage = gradioApp().querySelector('div[id^="tab_"] div[id$="_results"] .thumbnail-item > img');
        const src = galleryImage?.src;
        if (!src) return "";

        try {
            const dataUrl = await srcToDataUrl(src);
            if (!dataUrl.startsWith("data:image/")) return "";
            return await resizeImageDataUrl(dataUrl, THUMBNAIL_STORAGE_MAX_SIZE);
        } catch (err) {
            console.warn("Prompt snippets: could not use latest generation as thumbnail", err);
            return "";
        }
    }

    function promptThumbnailSeedChoice(anchorEl, hasLatest) {
        return new Promise((resolve) => {
            const pop = makePopover(anchorEl, "Thumbnail source");

            const body = document.createElement("div");
            body.className = "fps-popover-body";
            body.textContent = hasLatest
                ? "Use the latest generated image, upload a file, or skip the thumbnail."
                : "No recent generation was found. Upload a file or skip the thumbnail.";

            const actions = document.createElement("div");
            actions.className = "fps-popover-actions";

            const useLatest = document.createElement("button");
            useLatest.textContent = "Use latest";
            useLatest.title = "Use the latest generated image as the thumbnail.";
            useLatest.style.display = hasLatest ? "inline-flex" : "none";
            useLatest.onclick = () => {
                closePopover();
                resolve("latest");
            };

            const upload = document.createElement("button");
            upload.textContent = "Upload file";
            upload.title = "Choose an image file for the thumbnail.";
            upload.onclick = () => {
                closePopover();
                resolve("upload");
            };

            const skip = document.createElement("button");
            skip.textContent = "Skip";
            skip.title = "Save the snippet without a thumbnail.";
            skip.onclick = () => {
                closePopover();
                resolve("skip");
            };

            actions.appendChild(useLatest);
            actions.appendChild(upload);
            actions.appendChild(skip);
            pop.appendChild(body);
            pop.appendChild(actions);
        });
    }

    function slugPreview(text, maxLen = 45) {
        const clean = normalizeText(text);
        if (!clean) return "snippet";
        if (clean.length <= maxLen) return clean;
        return `${clean.slice(0, maxLen - 1)}...`;
    }

    function getFieldElement(fieldId) {
        const base = document.getElementById(fieldId);
        if (!base) return null;
        if (base.tagName && base.tagName.toLowerCase() === "textarea") return base;
        return base.querySelector("textarea") || base;
    }

    function notify(msg) {
        if (window.gradioApp && typeof window.gradioApp === "function") {
            // Kept simple for compatibility; console + title flash.
        }
        console.log(`[Prompt Snippets] ${msg}`);
    }

    function getDensityMode() {
        const raw = (typeof opts === "object" && opts !== null)
            ? String(opts[DENSITY_OPT_KEY] || "")
            : "";
        const normalized = raw.trim().toLowerCase();
        return normalized === DENSITY_COMPACT ? DENSITY_COMPACT : DENSITY_COMFORTABLE;
    }

    function getThumbnailSeedMode() {
        const raw = (typeof opts === "object" && opts !== null)
            ? String(opts[THUMBNAIL_OPT_KEY] || "")
            : "";
        const normalized = raw.trim().toLowerCase();

        if (normalized === THUMBNAIL_ASK) return "ask";
        if (normalized === THUMBNAIL_NEVER) return "never";
        return "always";
    }

    function applyDensityClass() {
        if (!document.body) return;
        document.body.classList.remove("fps-density-compact", "fps-density-comfortable");
        document.body.classList.add(`fps-density-${getDensityMode()}`);
    }

    function closePopover() {
        const existing = document.querySelector(`.${POPOVER_CLASS}`);
        if (existing) existing.remove();
    }

    function placeFloatingElement(el, x, y, pad = 10) {
        const vpW = window.innerWidth || document.documentElement.clientWidth || 1024;
        const vpH = window.innerHeight || document.documentElement.clientHeight || 768;
        const rect = el.getBoundingClientRect();

        let left = Math.max(pad, x);
        let top = Math.max(pad, y);

        if (left + rect.width > vpW - pad) {
            left = Math.max(pad, vpW - rect.width - pad);
        }
        if (top + rect.height > vpH - pad) {
            top = Math.max(pad, vpH - rect.height - pad);
        }

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    function makePopover(anchorEl, titleText) {
        closePopover();
        const pop = document.createElement("div");
        pop.className = POPOVER_CLASS;

        const title = document.createElement("div");
        title.className = "fps-popover-title";
        title.textContent = titleText;
        pop.appendChild(title);

        document.body.appendChild(pop);

        const rect = (anchorEl && anchorEl.getBoundingClientRect) ? anchorEl.getBoundingClientRect() : null;
        const left = rect ? rect.left : 16;
        const top = rect ? rect.bottom + 8 : 16;
        placeFloatingElement(pop, left, top, 10);

        setTimeout(() => {
            const outsideClose = (ev) => {
                if (!pop.contains(ev.target)) {
                    closePopover();
                    document.removeEventListener("mousedown", outsideClose, true);
                }
            };
            document.addEventListener("mousedown", outsideClose, true);
        }, 0);

        return pop;
    }

    function showInlineNotice(anchorEl, text) {
        const pop = makePopover(anchorEl, "Prompt Snippets");

        const body = document.createElement("div");
        body.className = "fps-popover-body";
        body.textContent = text;

        const actions = document.createElement("div");
        actions.className = "fps-popover-actions";

        const ok = document.createElement("button");
        ok.textContent = "OK";
        ok.title = "Close this message.";
        ok.onclick = closePopover;

        actions.appendChild(ok);
        pop.appendChild(body);
        pop.appendChild(actions);
    }

    function showInlineNamePrompt(anchorEl, defaultName, onSave) {
        const pop = makePopover(anchorEl, "Save snippet");

        const body = document.createElement("div");
        body.className = "fps-popover-body";
        body.textContent = "Snippet name";

        const input = document.createElement("input");
        input.className = "fps-popover-input";
        input.value = defaultName;

        const actions = document.createElement("div");
        actions.className = "fps-popover-actions";

        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.title = "Close without saving.";
        cancel.onclick = closePopover;

        const save = document.createElement("button");
        save.textContent = "Save";
        save.title = "Save this snippet with the name above.";
        save.onclick = () => {
            const value = (input.value || "").trim() || defaultName;
            onSave(value);
            closePopover();
        };

        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                save.click();
            }
            if (ev.key === "Escape") {
                ev.preventDefault();
                cancel.click();
            }
        });

        actions.appendChild(cancel);
        actions.appendChild(save);
        pop.appendChild(body);
        pop.appendChild(input);
        pop.appendChild(actions);

        input.focus();
        input.select();
    }

    function showInlineDeleteConfirm(anchorEl, snippetName, onDelete) {
        const pop = makePopover(anchorEl, "Delete snippet");

        const body = document.createElement("div");
        body.className = "fps-popover-body";
        body.textContent = `Delete "${snippetName || "(unnamed)"}"?`;

        const actions = document.createElement("div");
        actions.className = "fps-popover-actions";

        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.title = "Keep this snippet.";
        cancel.onclick = closePopover;

        const del = document.createElement("button");
        del.textContent = "Delete";
        del.title = "Delete permanently.";
        del.onclick = () => {
            onDelete();
            closePopover();
        };

        actions.appendChild(cancel);
        actions.appendChild(del);
        pop.appendChild(body);
        pop.appendChild(actions);
    }

    function showInlineThumbnailRemoveConfirm(anchorEl, onConfirm) {
        const pop = makePopover(anchorEl, "Remove thumbnail");

        const body = document.createElement("div");
        body.className = "fps-popover-body";
        body.textContent = "Remove this thumbnail from the snippet?";

        const actions = document.createElement("div");
        actions.className = "fps-popover-actions";

        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.title = "Keep the current thumbnail.";
        cancel.onclick = closePopover;

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.title = "Remove the thumbnail image.";
        remove.onclick = () => {
            onConfirm();
            closePopover();
        };

        actions.appendChild(cancel);
        actions.appendChild(remove);
        pop.appendChild(body);
        pop.appendChild(actions);
    }

    function insertAtCursor(textarea, text) {
        textarea.focus();
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);

        let glueLeft = "";
        let glueRight = "";
        const beforeTrimmed = before.trimEnd();
        const afterTrimmedStart = after.trimStart();
        const textTrimmedStart = (text || "").trimStart();
        const textTrimmedEnd = (text || "").trimEnd();

        const needsLeftComma = beforeTrimmed.length > 0
            && !beforeTrimmed.endsWith(",")
            && !textTrimmedStart.startsWith(",");

        const needsRightComma = afterTrimmedStart.length > 0
            && !afterTrimmedStart.startsWith(",")
            && !textTrimmedEnd.endsWith(",");

        if (needsLeftComma) glueLeft = ", ";
        if (needsRightComma) glueRight = ", ";

        const next = `${before}${glueLeft}${text}${glueRight}${after}`;
        const cursor = (before + glueLeft + text).length;
        textarea.value = next;
        textarea.setSelectionRange(cursor, cursor);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function appendPrompt(textarea, text) {
        const existing = textarea.value.trim();
        if (!existing) {
            textarea.value = text;
        } else if (existing.endsWith(",")) {
            textarea.value = `${existing} ${text}`;
        } else {
            textarea.value = `${existing}, ${text}`;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function replacePrompt(textarea, text) {
        textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function buildSnippet(name, content, origin) {
        return {
            id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name: name || slugPreview(content),
            content,
            origin,
            starred: false,
            thumbnail: "",
            createdAt: new Date().toISOString(),
        };
    }

    async function saveFromTextarea(textarea, origin, fullPrompt = false, anchorEl = null) {
        const selected = textarea.value.slice(textarea.selectionStart || 0, textarea.selectionEnd || 0);
        const raw = fullPrompt ? textarea.value : selected || textarea.value;
        const content = preserveSnippetText(raw);
        if (!content) {
            showInlineNotice(anchorEl, "Nothing to save. Select text or write a prompt first.");
            return;
        }

        const defaultName = slugPreview(content);
        showInlineNamePrompt(anchorEl, defaultName, (name) => {
            void (async () => {
                const seedMode = getThumbnailSeedMode();
                const latestThumbnail = seedMode === "never" ? "" : await getLatestGalleryThumbnailDataUrl();
                let thumbnail = "";

                if (seedMode === "always") {
                    thumbnail = latestThumbnail;
                } else if (seedMode === "ask") {
                    const choice = await promptThumbnailSeedChoice(anchorEl, !!latestThumbnail);
                    if (choice === "latest") {
                        thumbnail = latestThumbnail;
                    } else if (choice === "upload") {
                        try {
                            thumbnail = await pickThumbnailFromFile();
                        } catch (err) {
                            showInlineNotice(anchorEl, `Thumbnail upload failed: ${err.message}`);
                            thumbnail = "";
                        }
                    }
                }

                const snippets = loadSnippets();
                const snippet = buildSnippet((name || "").trim() || defaultName, content, origin);
                if (thumbnail) {
                    snippet.thumbnail = thumbnail;
                }
                snippets.push(snippet);
                saveSnippets(snippets);
                notify("Snippet saved");
                showInlineNotice(anchorEl, thumbnail ? "Snippet saved with thumbnail." : "Snippet saved.");
            })().catch((err) => {
                console.warn("Prompt snippets: save failed", err);
                showInlineNotice(anchorEl, "Snippet save failed.");
            });
        });
    }

    function deleteSnippet(id) {
        const snippets = loadSnippets().filter((s) => s.id !== id);
        saveSnippets(snippets);
    }

    function setSnippetStarred(id, starred) {
        const snippets = loadSnippets();
        const idx = snippets.findIndex((s) => s.id === id);
        if (idx < 0) return false;
        snippets[idx].starred = !!starred;
        saveSnippets(snippets);
        return true;
    }

    function setSnippetOrigin(id, origin) {
        if (!["positive", "negative", "both"].includes(origin)) return false;
        const snippets = loadSnippets();
        const idx = snippets.findIndex((s) => s.id === id);
        if (idx < 0) return false;
        snippets[idx].origin = origin;
        saveSnippets(snippets);
        return true;
    }
    
    function setSnippetThumbnail(id, thumbnail) {
        const snippets = loadSnippets();
        const idx = snippets.findIndex((s) => s.id === id);
        if (idx < 0) return false;
        snippets[idx].thumbnail = typeof thumbnail === "string" ? thumbnail : "";
        saveSnippets(snippets);
        return true;
    }

    function renameSnippet(id, newName) {
        const name = String(newName || "").trim();
        if (!name) return false;
        const snippets = loadSnippets();
        const idx = snippets.findIndex((s) => s.id === id);
        if (idx < 0) return false;
        snippets[idx].name = name;
        saveSnippets(snippets);
        return true;
    }

    function sanitizeNameForCompare(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    function exactSignature(name, content) {
        const n = String(name || "").trim();
        const c = preserveSnippetText(String(content || ""));
        return `${n}\n---\n${c}`;
    }

    function generateUniqueImportedName(baseName, reservedKeys) {
        const base = (String(baseName || "").trim() || "snippet").replace(/\s+/g, " ");
        let candidate = `imported ${base}`;
        let n = 2;
        let key = sanitizeNameForCompare(candidate);

        while (key && reservedKeys.has(key)) {
            candidate = `imported ${base} ${n}`;
            key = sanitizeNameForCompare(candidate);
            n += 1;
        }

        return candidate;
    }

    function sanitizeImportedSnippet(raw) {
        if (!raw || typeof raw !== "object") return null;
        const content = typeof raw.content === "string" ? raw.content : "";
        const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : slugPreview(content || "snippet");
        const origin = raw.origin === "positive" || raw.origin === "negative" || raw.origin === "both" ? raw.origin : "both";
        const starred = raw.starred === true;
        const thumbnail = typeof raw.thumbnail === "string" && raw.thumbnail.startsWith("data:image/") ? raw.thumbnail : "";
        if (!content) return null;

        return {
            id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name,
            content: preserveSnippetText(content),
            origin,
            starred,
            thumbnail,
            createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
        };
    }

    function downloadJson(filename, data) {
        const text = JSON.stringify(data, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 250);
    }

    function exportSnippets(scope) {
        const all = loadSnippets();
        const payload = scope === "all" ? all : [];

        if (!payload.length) return false;

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = `forge_prompt_snippets_all_${stamp}.json`;
        downloadJson(file, payload);
        return true;
    }

    function exportSingleSnippet(snippet) {
        if (!snippet || !snippet.content) return false;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const nameSafe = (snippet.name || "snippet").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "snippet";
        const file = `forge_prompt_snippet_${nameSafe}_${stamp}.json`;
        downloadJson(file, [snippet]);
        return true;
    }
    
    async function chooseSnippetThumbnail(snippetId, anchorEl, repaint) {
        try {
            const thumbnail = await pickThumbnailFromFile();
            if (!thumbnail) return;
            if (!setSnippetThumbnail(snippetId, thumbnail)) {
                showInlineNotice(anchorEl, "Could not update thumbnail.");
                return;
            }
            repaint();
            showInlineNotice(anchorEl, "Thumbnail updated.");
        } catch (err) {
            showInlineNotice(anchorEl, `Thumbnail upload failed: ${err.message}`);
        }
    }

    function importSnippetsFromFile(onDone) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.style.display = "none";
        document.body.appendChild(input);

        input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            if (!file) {
                input.remove();
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result || "[]"));
                    const list = Array.isArray(parsed) ? parsed : [];
                    const cleaned = list.map(sanitizeImportedSnippet).filter(Boolean);

                    if (!cleaned.length) {
                        onDone({ ok: false, message: "No valid snippets in JSON." });
                        return;
                    }

                    onDone({ ok: true, snippets: cleaned, count: cleaned.length });
                } catch (err) {
                    onDone({ ok: false, message: `Import failed: ${err.message}` });
                } finally {
                    input.remove();
                }
            };

            reader.onerror = () => {
                onDone({ ok: false, message: "Could not read selected file." });
                input.remove();
            };

            reader.readAsText(file, "utf-8");
        });

        input.click();
    }

    function showImportConflictResolver(anchorEl, existingSnippets, importedSnippets, onDone) {
        const existingByKey = new Map();
        existingSnippets.forEach((s) => {
            const key = sanitizeNameForCompare(s.name);
            if (key && !existingByKey.has(key)) existingByKey.set(key, s);
        });

        const existingExact = new Set(existingSnippets.map((s) => exactSignature(s.name, s.content)));
        const importedExact = new Set();
        let skippedExact = 0;

        const nonConflicts = [];
        const conflicts = [];

        importedSnippets.forEach((snippet) => {
            const sig = exactSignature(snippet.name, snippet.content);
            if (existingExact.has(sig) || importedExact.has(sig)) {
                skippedExact += 1;
                return;
            }
            importedExact.add(sig);

            const key = sanitizeNameForCompare(snippet.name);
            const existing = key ? existingByKey.get(key) : null;
            if (existing) {
                conflicts.push({ key, existing, incoming: snippet });
            } else {
                nonConflicts.push(snippet);
            }
        });

        if (!conflicts.length && !nonConflicts.length) {
            onDone({
                ok: true,
                imported: importedSnippets.length,
                added: 0,
                overridden: 0,
                ignored: 0,
                renamed: 0,
                skippedExact,
                conflicts: 0,
            });
            return;
        }

        if (!conflicts.length) {
            const next = [...existingSnippets, ...nonConflicts];
            saveSnippets(next);
            onDone({
                ok: true,
                imported: importedSnippets.length,
                added: nonConflicts.length,
                overridden: 0,
                ignored: 0,
                renamed: 0,
                skippedExact,
                conflicts: 0,
            });
            return;
        }

        const pop = makePopover(anchorEl, "Import conflicts");
        const summary = document.createElement("div");
        summary.className = "fps-popover-body";
        const skippedLabel = skippedExact > 0 ? ` Auto-skipped exact duplicates: ${skippedExact}.` : "";
        summary.textContent = `Found ${conflicts.length} name conflict(s). Choose what to do for each imported snippet.${skippedLabel}`;
        pop.appendChild(summary);

        const list = document.createElement("div");
        list.className = "fps-conflicts-list";

        const rows = [];

        conflicts.forEach((conflict, idx) => {
            const row = document.createElement("div");
            row.className = "fps-conflict-row";

            const title = document.createElement("div");
            title.className = "fps-conflict-title";
            title.textContent = `Conflict ${idx + 1}: ${conflict.incoming.name}`;

            const existingLabel = document.createElement("div");
            existingLabel.className = "fps-conflict-label";
            existingLabel.textContent = "Current snippet:";

            const existingText = document.createElement("pre");
            existingText.className = "fps-conflict-text";
            existingText.textContent = conflict.existing.content || "";

            const incomingLabel = document.createElement("div");
            incomingLabel.className = "fps-conflict-label";
            incomingLabel.textContent = "Imported snippet:";

            const incomingText = document.createElement("pre");
            incomingText.className = "fps-conflict-text";
            incomingText.textContent = conflict.incoming.content || "";

            const select = document.createElement("select");
            select.className = "fps-conflict-select";
            select.title = "Choose how to handle this name conflict.";

            const optionOverride = document.createElement("option");
            optionOverride.value = "override";
            optionOverride.textContent = "Override existing";

            const optionIgnore = document.createElement("option");
            optionIgnore.value = "ignore";
            optionIgnore.textContent = "Ignore imported";

            const optionRename = document.createElement("option");
            optionRename.value = "rename";
            optionRename.textContent = "Rename imported";

            select.appendChild(optionRename);
            select.appendChild(optionOverride);
            select.appendChild(optionIgnore);
            select.value = "rename";

            const renameInput = document.createElement("input");
            renameInput.className = "fps-conflict-rename";
            renameInput.value = `imported ${conflict.incoming.name || "snippet"}`;
            renameInput.title = "Used only when Rename imported is selected.";

            select.addEventListener("change", () => {
                const isRename = select.value === "rename";
                renameInput.disabled = !isRename;
                renameInput.style.display = isRename ? "block" : "none";
            });
            renameInput.disabled = false;
            renameInput.style.display = "block";

            row.appendChild(title);
            row.appendChild(existingLabel);
            row.appendChild(existingText);
            row.appendChild(incomingLabel);
            row.appendChild(incomingText);
            row.appendChild(select);
            row.appendChild(renameInput);
            list.appendChild(row);

            rows.push({ conflict, select, renameInput });
        });

        pop.appendChild(list);

        const actions = document.createElement("div");
        actions.className = "fps-popover-actions";

        const cancel = document.createElement("button");
        cancel.textContent = "Cancel import";
        cancel.title = "Cancel and keep your current snippets unchanged.";
        cancel.onclick = closePopover;

        const apply = document.createElement("button");
        apply.textContent = "Apply choices";
        apply.title = "Apply the selected conflict actions and finish import.";
        apply.onclick = () => {
            const nextExisting = [...existingSnippets];
            const additions = [...nonConflicts];
            const existingIndexByKey = new Map();
            nextExisting.forEach((s, i) => {
                const key = sanitizeNameForCompare(s.name);
                if (key && !existingIndexByKey.has(key)) existingIndexByKey.set(key, i);
            });

            const reservedKeys = new Set();
            nextExisting.forEach((s) => {
                const key = sanitizeNameForCompare(s.name);
                if (key) reservedKeys.add(key);
            });
            additions.forEach((s) => {
                const key = sanitizeNameForCompare(s.name);
                if (key) reservedKeys.add(key);
            });

            let overridden = 0;
            let ignored = 0;
            let renamed = 0;

            rows.forEach((rowState) => {
                const { conflict, select, renameInput } = rowState;
                const mode = select.value;

                if (mode === "ignore") {
                    ignored += 1;
                    return;
                }

                if (mode === "override") {
                    const idx = existingIndexByKey.get(conflict.key);
                    if (idx !== undefined) {
                        const original = nextExisting[idx];
                        nextExisting[idx] = {
                            ...conflict.incoming,
                            id: original.id,
                            createdAt: original.createdAt,
                        };
                        overridden += 1;
                    } else {
                        additions.push(conflict.incoming);
                        const key = sanitizeNameForCompare(conflict.incoming.name);
                        if (key) reservedKeys.add(key);
                    }
                    return;
                }

                let chosen = String(renameInput.value || "").trim();
                if (!chosen) {
                    chosen = generateUniqueImportedName(conflict.incoming.name, reservedKeys);
                }

                let key = sanitizeNameForCompare(chosen);
                if (!key) {
                    chosen = generateUniqueImportedName(conflict.incoming.name, reservedKeys);
                    key = sanitizeNameForCompare(chosen);
                }

                while (key && reservedKeys.has(key)) {
                    chosen = generateUniqueImportedName(chosen, reservedKeys);
                    key = sanitizeNameForCompare(chosen);
                }

                additions.push({
                    ...conflict.incoming,
                    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                    name: chosen,
                });
                if (key) reservedKeys.add(key);
                renamed += 1;
            });

            const next = [...nextExisting, ...additions];
            saveSnippets(next);
            closePopover();
            onDone({
                ok: true,
                imported: importedSnippets.length,
                added: additions.length,
                overridden,
                ignored,
                renamed,
                skippedExact,
                conflicts: conflicts.length,
            });
        };

        actions.appendChild(cancel);
        actions.appendChild(apply);
        pop.appendChild(actions);
    }

    function moveSnippetInScopedOrder(fieldType, draggedId, targetId, placeAfter) {
        if (!draggedId || !targetId || draggedId === targetId) return false;

        const all = loadSnippets();
        const inScope = (s) => s.origin === fieldType || s.origin === "both";
        const scoped = all.filter(inScope);

        const from = scoped.findIndex((s) => s.id === draggedId);
        const to = scoped.findIndex((s) => s.id === targetId);
        if (from < 0 || to < 0) return false;

        const [dragged] = scoped.splice(from, 1);
        const targetIdx = scoped.findIndex((s) => s.id === targetId);
        const insertAt = Math.max(0, targetIdx + (placeAfter ? 1 : 0));
        scoped.splice(insertAt, 0, dragged);

        let scopeCursor = 0;
        const merged = all.map((snippet) => {
            if (inScope(snippet)) {
                const nextScoped = scoped[scopeCursor];
                scopeCursor += 1;
                return nextScoped;
            }
            return snippet;
        });

        saveSnippets(merged);
        return true;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
.${TOOLBAR_CLASS} {
    display: flex;
    gap: 8px;
    margin: 8px 0 4px;
    flex-wrap: wrap;
}
.${TOOLBAR_CLASS} .fps-btn {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
.${TOOLBAR_CLASS} .fps-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
}
.${MENU_CLASS} {
    position: fixed;
    z-index: 10000;
    width: min(860px, calc(100vw - 24px));
    min-width: 460px;
    max-width: calc(100vw - 24px);
    max-height: 72vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--block-border-color, #555);
    background: linear-gradient(180deg, rgba(33, 39, 58, 0.97), rgba(24, 28, 43, 0.97));
    border-radius: 12px;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45);
    padding: 12px;
    backdrop-filter: blur(4px);
}
.${MENU_CLASS} .fps-empty {
    opacity: 0.8;
    font-size: 14px;
    padding: 10px;
}
.${MENU_CLASS} .fps-row {
    border: 1px solid var(--input-border-color, #444);
    border-radius: 10px;
    padding: 10px;
    margin: 8px 0;
    background: rgba(16, 21, 33, 0.55);
}
.${MENU_CLASS} .fps-row-body {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
}
.${MENU_CLASS} .fps-thumb-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
}
.${MENU_CLASS} .fps-thumbnail {
    width: 100%;
    height: 180px;
    border-radius: 10px;
    border: 1px solid var(--input-border-color, #555);
    background: rgba(255, 255, 255, 0.04);
    object-fit: cover;
    display: block;
    flex: 0 0 auto;
}
.${MENU_CLASS} .fps-thumbnail-placeholder {
    width: 100%;
    height: 180px;
    border-radius: 10px;
    border: 1px dashed var(--input-border-color, #555);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 11px;
    line-height: 1.15;
    padding: 4px;
    user-select: none;
}
.${MENU_CLASS} .fps-row.fps-dragging {
    opacity: 0.55;
}
.${MENU_CLASS} .fps-row.fps-drop-before {
    border-top: 2px solid rgba(126, 181, 255, 0.95);
}
.${MENU_CLASS} .fps-row.fps-drop-after {
    border-bottom: 2px solid rgba(126, 181, 255, 0.95);
}
.${MENU_CLASS} .fps-name {
    font-weight: 600;
    font-size: 20px;
    margin-bottom: 8px;
}
.${MENU_CLASS} .fps-name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.${MENU_CLASS} .fps-drag-handle {
    border: 1px solid var(--button-border-color, #666);
    background: rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 2px 8px;
    font-size: 12px;
    line-height: 1.2;
    cursor: grab;
    user-select: none;
}
.${MENU_CLASS} .fps-drag-handle:active {
    cursor: grabbing;
}
.${MENU_CLASS} .fps-title-wrap {
    min-width: 0;
    flex: 1 1 auto;
}
.${MENU_CLASS} .fps-origin {
    opacity: 0.8;
    font-size: 12px;
    margin-left: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.${MENU_CLASS} .fps-star-badge {
    margin-left: 8px;
    font-size: 14px;
    opacity: 0.95;
}
.${MENU_CLASS} .fps-content {
    font-size: 14px;
    opacity: 0.95;
    line-height: 1.45;
    margin-bottom: 8px;
    max-height: 96px;
    overflow: auto;
}
.${MENU_CLASS} .fps-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.${MENU_CLASS} .fps-actions button {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
.${MENU_CLASS} .fps-close-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    gap: 8px;
}
.${MENU_CLASS} .fps-close-row strong {
    font-size: 30px;
    letter-spacing: 0.02em;
}
.${MENU_CLASS} .fps-close-row button {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
.${MENU_CLASS} .fps-search {
    width: 100%;
    margin: 6px 0 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--input-border-color, #555);
    background: var(--input-background-fill, #141414);
    color: var(--body-text-color, #fff);
    font-size: 14px;
}
.${MENU_CLASS} .fps-top-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 10px;
}
.${MENU_CLASS} .fps-list {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    max-height: min(54vh, 560px);
    padding-right: 2px;
}
.${MENU_CLASS} .fps-top-actions button {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
.${MENU_CLASS} .fps-top-actions button.fps-active {
    background: rgba(255, 215, 96, 0.2);
    border-color: rgba(255, 215, 96, 0.75);
}
.${MENU_CLASS} .fps-thumb-actions {
    display: flex;
    gap: 6px;
    margin-top: 0;
    flex-wrap: wrap;
}
.${MENU_CLASS} .fps-thumb-actions button {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}
.${MENU_CLASS} .fps-thumb-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(12, 16, 25, 0.78);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}
.${MENU_CLASS} .fps-thumb-remove:hover {
    filter: brightness(1.12);
}
.${MENU_CLASS} .fps-sort-tip {
    margin: 2px 0 10px;
    font-size: 12px;
    opacity: 0.82;
}
.${POPOVER_CLASS} {
    position: fixed;
    z-index: 10001;
    width: min(560px, calc(100vw - 24px));
    min-width: 340px;
    max-width: calc(100vw - 24px);
    border: 1px solid var(--block-border-color, #555);
    background: linear-gradient(180deg, rgba(33, 39, 58, 0.98), rgba(24, 28, 43, 0.98));
    border-radius: 12px;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45);
    padding: 12px;
}
.${POPOVER_CLASS} .fps-popover-title {
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 8px;
}
.${POPOVER_CLASS} .fps-popover-body {
    font-size: 14px;
    opacity: 0.95;
    margin-bottom: 10px;
    line-height: 1.45;
}
.${POPOVER_CLASS} .fps-popover-input {
    width: 100%;
    margin-bottom: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--input-border-color, #555);
    background: var(--input-background-fill, #141414);
    color: var(--body-text-color, #fff);
    font-size: 14px;
}
.${POPOVER_CLASS} .fps-popover-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
.${POPOVER_CLASS} .fps-popover-actions button {
    border: 1px solid var(--button-border-color, #666);
    background: var(--button-secondary-background-fill, #2b2b2b);
    color: var(--button-secondary-text-color, #fff);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
.${POPOVER_CLASS} .fps-conflicts-list {
    max-height: 340px;
    overflow: auto;
    margin-bottom: 8px;
}
.${POPOVER_CLASS} .fps-conflict-row {
    border: 1px solid var(--input-border-color, #444);
    border-radius: 8px;
    padding: 8px;
    margin-bottom: 8px;
}
.${POPOVER_CLASS} .fps-conflict-title {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 6px;
}
.${POPOVER_CLASS} .fps-conflict-label {
    font-size: 12px;
    opacity: 0.85;
    margin: 4px 0;
}
.${POPOVER_CLASS} .fps-conflict-text {
    margin: 0;
    padding: 6px;
    font-size: 12px;
    line-height: 1.35;
    border-radius: 6px;
    border: 1px solid var(--input-border-color, #555);
    background: var(--input-background-fill, #141414);
    color: var(--body-text-color, #fff);
    max-height: 80px;
    overflow: auto;
    white-space: pre-wrap;
}
.${POPOVER_CLASS} .fps-conflict-select {
    width: 100%;
    margin-top: 8px;
    margin-bottom: 6px;
    padding: 6px;
    border-radius: 6px;
    border: 1px solid var(--input-border-color, #555);
    background: var(--input-background-fill, #141414);
    color: var(--body-text-color, #fff);
    font-size: 13px;
}
.${POPOVER_CLASS} .fps-conflict-rename {
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--input-border-color, #555);
    background: var(--input-background-fill, #141414);
    color: var(--body-text-color, #fff);
    font-size: 13px;
}
body.fps-density-compact .${TOOLBAR_CLASS} {
    gap: 6px;
    margin: 6px 0 2px;
}
body.fps-density-compact .${TOOLBAR_CLASS} .fps-btn {
    border-radius: 7px;
    padding: 4px 8px;
    font-size: 12px;
}
body.fps-density-compact .${MENU_CLASS} {
    width: min(760px, calc(100vw - 24px));
    max-height: 66vh;
    border-radius: 10px;
    padding: 9px;
}
body.fps-density-compact .${MENU_CLASS} .fps-close-row strong {
    font-size: 24px;
}
body.fps-density-compact .${MENU_CLASS} .fps-name {
    font-size: 16px;
    margin-bottom: 6px;
}
body.fps-density-compact .${MENU_CLASS} .fps-content {
    font-size: 12px;
    margin-bottom: 6px;
    max-height: 72px;
}
body.fps-density-compact .${MENU_CLASS} .fps-actions {
    gap: 6px;
}
body.fps-density-compact .${MENU_CLASS} .fps-actions button,
body.fps-density-compact .${MENU_CLASS} .fps-top-actions button,
body.fps-density-compact .${MENU_CLASS} .fps-close-row button {
    padding: 3px 7px;
    font-size: 11px;
}
body.fps-density-compact .${MENU_CLASS} .fps-search {
    padding: 6px 8px;
    font-size: 12px;
}
body.fps-density-compact .${POPOVER_CLASS} {
    width: min(460px, calc(100vw - 24px));
    min-width: 300px;
    border-radius: 10px;
    padding: 10px;
}
body.fps-density-compact .${POPOVER_CLASS} .fps-popover-title {
    font-size: 13px;
}
body.fps-density-compact .${POPOVER_CLASS} .fps-popover-body,
body.fps-density-compact .${POPOVER_CLASS} .fps-popover-input {
    font-size: 12px;
}
body.fps-density-compact .${MENU_CLASS} .fps-list {
    max-height: min(48vh, 460px);
}
@media (max-width: 820px) {
    .${MENU_CLASS} {
        min-width: 0;
        width: calc(100vw - 16px);
        max-width: calc(100vw - 16px);
        max-height: 76vh;
        padding: 10px;
    }
    .${MENU_CLASS} .fps-list {
        max-height: min(56vh, 520px);
    }
    .${MENU_CLASS} .fps-close-row strong {
        font-size: 20px;
    }
    .${MENU_CLASS} .fps-name {
        font-size: 16px;
    }
    .${POPOVER_CLASS} {
        min-width: 0;
        width: calc(100vw - 16px);
        max-width: calc(100vw - 16px);
        padding: 10px;
    }
}
        `;
        document.head.appendChild(style);
    }

    function closeMenu() {
        const existing = document.querySelector(`.${MENU_CLASS}`);
        if (existing) existing.remove();
    }

    function renderMenu(textarea, fieldType, x, y) {
        closeMenu();
        const menu = document.createElement("div");
        menu.className = MENU_CLASS;
        menu.style.left = "10px";
        menu.style.top = "10px";

        const closeRow = document.createElement("div");
        closeRow.className = "fps-close-row";
        closeRow.innerHTML = `<strong>Saved snippets (${fieldType})</strong>`;
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Close";
        closeBtn.title = "Close snippet popup.";
        closeBtn.onclick = closeMenu;
        closeRow.appendChild(closeBtn);

        const search = document.createElement("input");
        search.className = "fps-search";
        search.placeholder = "Search snippets...";

        const topActions = document.createElement("div");
        topActions.className = "fps-top-actions";
        let showStarredOnly = false;

        const btnExportAll = document.createElement("button");
        btnExportAll.textContent = "Export all";
        btnExportAll.title = "Download all snippets as one JSON file.";
        btnExportAll.onclick = () => {
            const ok = exportSnippets("all");
            if (!ok) showInlineNotice(btnExportAll, "No snippets to export.");
            else showInlineNotice(btnExportAll, "Exported full JSON file.");
        };

        const btnImport = document.createElement("button");
        btnImport.textContent = "Import JSON";
        btnImport.title = "Import snippets from JSON. Name conflicts are reviewed before applying.";
        btnImport.onclick = () => {
            importSnippetsFromFile((result) => {
                if (!result.ok) {
                    showInlineNotice(btnImport, result.message || "Import failed.");
                    return;
                }

                showImportConflictResolver(btnImport, loadSnippets(), result.snippets || [], (summaryInfo) => {
                    if (!summaryInfo || !summaryInfo.ok) {
                        showInlineNotice(btnImport, "Import was cancelled.");
                        return;
                    }

                    showInlineNotice(
                        btnImport,
                        `Import complete. Added: ${summaryInfo.added}, Overridden: ${summaryInfo.overridden}, Renamed: ${summaryInfo.renamed}, Ignored: ${summaryInfo.ignored}, Auto-skipped exact: ${summaryInfo.skippedExact || 0}.`
                    );
                    repaint();
                });
            });
        };

        const btnFilterStarred = document.createElement("button");
        btnFilterStarred.textContent = "Starred only: Off";
        btnFilterStarred.title = "Show only starred snippets in this popup.";
        btnFilterStarred.onclick = () => {
            showStarredOnly = !showStarredOnly;
            btnFilterStarred.textContent = `Starred only: ${showStarredOnly ? "On" : "Off"}`;
            btnFilterStarred.classList.toggle("fps-active", showStarredOnly);
            repaint();
        };

        topActions.appendChild(btnExportAll);
        topActions.appendChild(btnImport);
        topActions.appendChild(btnFilterStarred);

        const sortTip = document.createElement("div");
        sortTip.className = "fps-sort-tip";
        sortTip.textContent = "Tip: drag snippets with the handle to reorder. New snippets are added at the bottom.";

        const list = document.createElement("div");
        list.className = "fps-list";

        function repaint() {
            const q = (search.value || "").trim().toLowerCase();
            const snippets = loadSnippets().filter((s) => s.origin === fieldType || s.origin === "both");
            const scopeFiltered = showStarredOnly ? snippets.filter((s) => s.starred === true) : snippets;
            const filteredBySearch = !q
                ? scopeFiltered
                : scopeFiltered.filter((s) =>
                    (s.name || "").toLowerCase().includes(q) || (s.content || "").toLowerCase().includes(q)
                );

            const starredItems = filteredBySearch.filter((s) => s.starred === true);
            const normalItems = filteredBySearch.filter((s) => s.starred !== true);
            const filtered = [...starredItems, ...normalItems];

            list.innerHTML = "";
            if (!filtered.length) {
                const empty = document.createElement("div");
                empty.className = "fps-empty";
                empty.textContent = "No snippets for this prompt type yet.";
                list.appendChild(empty);
                return;
            }

            filtered.forEach((snippet) => {
                const row = document.createElement("div");
                row.className = "fps-row";
                row.dataset.snippetId = snippet.id;

                const rowBody = document.createElement("div");
                rowBody.className = "fps-row-body";

                const thumbPanel = document.createElement("div");
                thumbPanel.className = "fps-thumb-panel";

                const thumbnail = snippet.thumbnail && typeof snippet.thumbnail === "string" && snippet.thumbnail.startsWith("data:image/")
                    ? (() => {
                        const img = document.createElement("img");
                        img.className = "fps-thumbnail";
                        img.src = snippet.thumbnail;
                        img.alt = `${snippet.name || "snippet"} thumbnail`;
                        img.title = "Click to replace thumbnail.";
                        img.style.cursor = "pointer";
                        img.addEventListener("click", () => chooseSnippetThumbnail(snippet.id, img, repaint));
                        return img;
                    })()
                    : (() => {
                        const placeholder = document.createElement("div");
                        placeholder.className = "fps-thumbnail-placeholder";
                        placeholder.textContent = "No thumbnail";
                        placeholder.title = "Click to add a thumbnail.";
                        placeholder.style.cursor = "pointer";
                        placeholder.addEventListener("click", () => chooseSnippetThumbnail(snippet.id, placeholder, repaint));
                        return placeholder;
                    })();

                thumbPanel.appendChild(thumbnail);

                if (snippet.thumbnail) {
                    const btnThumbRemove = document.createElement("button");
                    btnThumbRemove.className = "fps-thumb-remove";
                    btnThumbRemove.textContent = "🗑";
                    btnThumbRemove.setAttribute("aria-label", "Remove thumbnail");
                    btnThumbRemove.title = "Remove thumbnail";
                    btnThumbRemove.onclick = () => {
                        showInlineThumbnailRemoveConfirm(btnThumbRemove, () => {
                            if (setSnippetThumbnail(snippet.id, "")) repaint();
                        });
                    };
                    thumbPanel.appendChild(btnThumbRemove);
                }

                const head = document.createElement("div");
                head.className = "fps-name";
                const originTag = snippet.origin || "unknown";

                const headRow = document.createElement("div");
                headRow.className = "fps-name-row";

                const titleWrap = document.createElement("div");
                titleWrap.className = "fps-title-wrap";
                const starBadge = snippet.starred === true ? `<span class="fps-star-badge" title="Starred snippet">★</span>` : "";
                titleWrap.innerHTML = `${snippet.name || "(unnamed)"}<span class="fps-origin">${originTag}</span>${starBadge}`;

                const dragHandle = document.createElement("div");
                dragHandle.className = "fps-drag-handle";
                dragHandle.textContent = "drag";
                dragHandle.title = "Drag to move this snippet up or down.";
                dragHandle.draggable = true;

                dragHandle.addEventListener("dragstart", (ev) => {
                    row.classList.add("fps-dragging");
                    if (ev.dataTransfer) {
                        ev.dataTransfer.setData("text/plain", snippet.id);
                        ev.dataTransfer.effectAllowed = "move";
                    }
                });
                dragHandle.addEventListener("dragend", () => {
                    row.classList.remove("fps-dragging");
                    list.querySelectorAll(".fps-row").forEach((r) => r.classList.remove("fps-drop-before", "fps-drop-after"));
                });

                row.addEventListener("dragover", (ev) => {
                    ev.preventDefault();
                    const rect = row.getBoundingClientRect();
                    const after = (ev.clientY - rect.top) > (rect.height / 2);
                    row.classList.toggle("fps-drop-after", after);
                    row.classList.toggle("fps-drop-before", !after);
                    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("fps-drop-before", "fps-drop-after");
                });
                row.addEventListener("drop", (ev) => {
                    ev.preventDefault();
                    row.classList.remove("fps-drop-before", "fps-drop-after");
                    const draggedId = ev.dataTransfer ? ev.dataTransfer.getData("text/plain") : "";
                    if (!draggedId || draggedId === snippet.id) return;
                    const rect = row.getBoundingClientRect();
                    const placeAfter = (ev.clientY - rect.top) > (rect.height / 2);
                    const moved = moveSnippetInScopedOrder(fieldType, draggedId, snippet.id, placeAfter);
                    if (moved) repaint();
                });

                headRow.appendChild(titleWrap);
                headRow.appendChild(dragHandle);
                head.appendChild(headRow);

                const content = document.createElement("div");
                content.className = "fps-content";
                content.textContent = snippet.content;

                const actions = document.createElement("div");
                actions.className = "fps-actions";

                const btnInsert = document.createElement("button");
                btnInsert.textContent = "Insert at cursor";
                btnInsert.title = "Insert this snippet at the current cursor position.";
                btnInsert.onclick = () => insertAtCursor(textarea, snippet.content);

                const btnAppend = document.createElement("button");
                btnAppend.textContent = "Append";
                btnAppend.title = "Add this snippet to the end of the prompt.";
                btnAppend.onclick = () => appendPrompt(textarea, snippet.content);

                const btnReplace = document.createElement("button");
                btnReplace.textContent = "Replace";
                btnReplace.title = "Replace the entire prompt with this snippet.";
                btnReplace.onclick = () => replacePrompt(textarea, snippet.content);

                const btnExportOne = document.createElement("button");
                btnExportOne.textContent = "Export JSON";
                btnExportOne.title = "Download only this snippet as a JSON file.";
                btnExportOne.onclick = () => {
                    const ok = exportSingleSnippet(snippet);
                    if (!ok) showInlineNotice(btnExportOne, "Could not export this snippet.");
                    else showInlineNotice(btnExportOne, "Exported this snippet as JSON.");
                };

                const btnRename = document.createElement("button");
                btnRename.textContent = "Rename";
                btnRename.title = "Rename this snippet without changing its prompt text.";
                btnRename.onclick = () => {
                    showInlineNamePrompt(btnRename, snippet.name || "snippet", (value) => {
                        if (!renameSnippet(snippet.id, value)) {
                            showInlineNotice(btnRename, "Could not rename this snippet.");
                            return;
                        }
                        repaint();
                    });
                };

                const btnSaveBoth = document.createElement("button");
                btnSaveBoth.textContent = "Mark both";
                btnSaveBoth.title = "Make this snippet available in both positive and negative menus.";
                btnSaveBoth.onclick = () => {
                    if (setSnippetOrigin(snippet.id, "both")) repaint();
                };

                const btnPositiveOnly = document.createElement("button");
                btnPositiveOnly.textContent = "Set positive only";
                btnPositiveOnly.title = "Make this snippet available only in positive prompt menus.";
                btnPositiveOnly.onclick = () => {
                    if (setSnippetOrigin(snippet.id, "positive")) repaint();
                };

                const btnNegativeOnly = document.createElement("button");
                btnNegativeOnly.textContent = "Set negative only";
                btnNegativeOnly.title = "Make this snippet available only in negative prompt menus.";
                btnNegativeOnly.onclick = () => {
                    if (setSnippetOrigin(snippet.id, "negative")) repaint();
                };

                const btnStar = document.createElement("button");
                const isStarred = snippet.starred === true;
                btnStar.textContent = isStarred ? "Unstar" : "Star";
                btnStar.title = isStarred
                    ? "Remove from starred snippets."
                    : "Star this snippet and keep it pinned at the top.";
                btnStar.onclick = () => {
                    setSnippetStarred(snippet.id, !isStarred);
                    repaint();
                };

                const btnDelete = document.createElement("button");
                btnDelete.textContent = "Delete";
                btnDelete.title = "Delete this snippet from your library.";
                btnDelete.onclick = () => {
                    showInlineDeleteConfirm(btnDelete, snippet.name, () => {
                        deleteSnippet(snippet.id);
                        repaint();
                    });
                };

                actions.appendChild(btnInsert);
                actions.appendChild(btnAppend);
                actions.appendChild(btnReplace);
                actions.appendChild(btnExportOne);
                actions.appendChild(btnRename);
                if (snippet.origin === "both") {
                    actions.appendChild(btnPositiveOnly);
                    actions.appendChild(btnNegativeOnly);
                } else {
                    actions.appendChild(btnSaveBoth);
                }
                actions.appendChild(btnStar);
                actions.appendChild(btnDelete);

                rowBody.appendChild(thumbPanel);

                const contentBlock = document.createElement("div");
                contentBlock.appendChild(head);
                contentBlock.appendChild(content);
                contentBlock.appendChild(actions);

                rowBody.appendChild(contentBlock);
                row.appendChild(rowBody);
                list.appendChild(row);
            });
        }

        search.addEventListener("input", repaint);

        menu.appendChild(closeRow);
        menu.appendChild(topActions);
        menu.appendChild(sortTip);
        menu.appendChild(search);
        menu.appendChild(list);
        document.body.appendChild(menu);
        placeFloatingElement(menu, x, y, 10);

        repaint();

        setTimeout(() => {
            const outsideClose = (ev) => {
                if (!menu.contains(ev.target)) {
                    closeMenu();
                    document.removeEventListener("mousedown", outsideClose, true);
                }
            };
            document.addEventListener("mousedown", outsideClose, true);
        }, 0);
    }

    function injectToolbar(fieldConfig) {
        const textarea = getFieldElement(fieldConfig.id);
        if (!textarea) return;

        if (textarea.dataset.fpsEnhanced === "1") return;
        textarea.dataset.fpsEnhanced = "1";

        const toolbar = document.createElement("div");
        toolbar.className = TOOLBAR_CLASS;

        const saveSel = document.createElement("button");
        saveSel.className = "fps-btn";
        saveSel.textContent = "Save selected";
        saveSel.title = `Save selected text from ${fieldConfig.label}`;
        saveSel.onclick = (ev) => saveFromTextarea(textarea, fieldConfig.type, false, ev.currentTarget);

        const saveAll = document.createElement("button");
        saveAll.className = "fps-btn";
        saveAll.textContent = "Save full";
        saveAll.title = `Save full prompt from ${fieldConfig.label}`;
        saveAll.onclick = (ev) => saveFromTextarea(textarea, fieldConfig.type, true, ev.currentTarget);

        const open = document.createElement("button");
        open.className = "fps-btn";
        open.textContent = "Snippets";
        open.title = `Open saved snippets for ${fieldConfig.type}`;
        open.onclick = (ev) => {
            const rect = open.getBoundingClientRect();
            renderMenu(textarea, fieldConfig.type, rect.left, rect.bottom + 6);
            ev.stopPropagation();
        };

        toolbar.appendChild(saveSel);
        toolbar.appendChild(saveAll);
        toolbar.appendChild(open);

        const container = textarea.closest(".gradio-textbox") || textarea.parentElement;
        if (!container) return;
        container.appendChild(toolbar);
    }

    function runSetup() {
        ensureStyles();
        applyDensityClass();
        FIELD_MAP.forEach(injectToolbar);
    }

    const uiLoadedHook = typeof onUiLoaded === "function"
        ? onUiLoaded
        : (typeof window !== "undefined" && typeof window.onUiLoaded === "function" ? window.onUiLoaded : null);

    if (!uiLoadedHook) {
        console.warn("Prompt Snippets: onUiLoaded hook was not found.");
        return;
    }

    uiLoadedHook(() => {
        runSetup();

        const observer = new MutationObserver(() => {
            runSetup();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
})();
