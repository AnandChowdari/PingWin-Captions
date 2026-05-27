/**
 * main.js — Captionizer CEP Panel Logic
 * Handles UI interactions, STT API calls, AI conversion, and AE integration.
 */

(function () {
    "use strict";

    // ──────────────────────────────────────────
    // Globals
    // ──────────────────────────────────────────
    var csInterface = null;
    var currentClip = null;
    var cancelled = false;

    const STORAGE_PREFIX = "captionizer_";
    const KEY_NAMES = ["elevenlabs", "deepgram", "gemini", "openrouter", "groq"];

    // ──────────────────────────────────────────
    // Init
    // ──────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", function () {
        // Try to initialize CSInterface (will fail outside AE)
        try {
            csInterface = new CSInterface();
        } catch (e) {
            console.warn("CSInterface not available — running outside AE.");
            csInterface = null;
        }

        initTabs();
        initPills();
        initToggle();
        loadApiKeys();
        bindButtons();
    });

    // ──────────────────────────────────────────
    // Tab Switching
    // ──────────────────────────────────────────
    function initTabs() {
        var tabBtns = document.querySelectorAll(".tab-btn");
        tabBtns.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var targetTab = btn.getAttribute("data-tab");

                tabBtns.forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");

                document.querySelectorAll(".tab-content").forEach(function (tc) {
                    tc.classList.remove("active");
                });
                document.getElementById("tab-" + targetTab).classList.add("active");
            });
        });
    }

    // ──────────────────────────────────────────
    // Pill Multi-Select
    // ──────────────────────────────────────────
    function initPills() {
        document.querySelectorAll(".pills .pill").forEach(function (pill) {
            pill.addEventListener("click", function () {
                pill.classList.toggle("active");
            });
        });
    }

    // ──────────────────────────────────────────
    // Translate Toggle
    // ──────────────────────────────────────────
    function initToggle() {
        var toggle = document.getElementById("translate-toggle");
        var target = document.getElementById("translate-target");

        toggle.addEventListener("change", function () {
            if (toggle.checked) {
                target.classList.add("visible");
            } else {
                target.classList.remove("visible");
            }
        });
    }

    // ──────────────────────────────────────────
    // API Keys — Load / Save
    // ──────────────────────────────────────────
    function loadApiKeys() {
        KEY_NAMES.forEach(function (key) {
            var stored = localStorage.getItem(STORAGE_PREFIX + key);
            if (stored) {
                document.getElementById("key-" + key).value = stored;
            }
        });
    }

    function saveApiKeys() {
        KEY_NAMES.forEach(function (key) {
            var value = document.getElementById("key-" + key).value.trim();
            if (value) {
                localStorage.setItem(STORAGE_PREFIX + key, value);
            } else {
                localStorage.removeItem(STORAGE_PREFIX + key);
            }
        });
    }

    function getApiKey(name) {
        return (document.getElementById("key-" + name).value || "").trim() ||
               (localStorage.getItem(STORAGE_PREFIX + name) || "").trim();
    }

    // ──────────────────────────────────────────
    // Button Bindings
    // ──────────────────────────────────────────
    function bindButtons() {
        document.getElementById("btn-read-clip").addEventListener("click", readSelectedClip);
        document.getElementById("btn-generate").addEventListener("click", generateCaptions);
        document.getElementById("btn-save-keys").addEventListener("click", function () {
            saveApiKeys();
            var fb = document.getElementById("save-feedback");
            fb.classList.add("visible");
            setTimeout(function () { fb.classList.remove("visible"); }, 2500);
        });
        document.getElementById("btn-cancel").addEventListener("click", function () {
            cancelled = true;
        });
        document.getElementById("btn-new-generation").addEventListener("click", resetGeneration);
    }

    // ──────────────────────────────────────────
    // Read Selected Clip
    // ──────────────────────────────────────────
    function readSelectedClip() {
        hideStatus();

        if (!csInterface) {
            showStatus("error", "Not running inside After Effects. CSInterface unavailable.");
            return;
        }

        csInterface.evalScript("getActiveClipInfo()", function (result) {
            try {
                var data = JSON.parse(result);
                if (data.error) {
                    showStatus("warning", data.error);
                    return;
                }
                currentClip = data;
                displayClipInfo(data);
            } catch (e) {
                showStatus("error", "Failed to parse clip info: " + e.message);
            }
        });
    }

    function displayClipInfo(data) {
        var clipBox = document.getElementById("clip-box");
        var clipEmpty = document.getElementById("clip-empty");
        var clipInfo = document.getElementById("clip-info");
        var clipName = document.getElementById("clip-name");
        var clipDuration = document.getElementById("clip-duration");
        var clipFps = document.getElementById("clip-fps");

        clipBox.classList.add("has-clip");
        clipEmpty.style.display = "none";
        clipInfo.style.display = "block";
        clipName.textContent = data.name;
        clipDuration.textContent = "⏱ " + formatDuration(data.duration);
        clipFps.textContent = data.frameRate ? (data.frameRate + " fps") : "";
    }

    function formatDuration(seconds) {
        if (!seconds) return "—";
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    // ──────────────────────────────────────────
    // Status Messages
    // ──────────────────────────────────────────
    function showStatus(type, msg) {
        var el = document.getElementById("status-msg");
        el.className = "status-msg visible " + type;
        el.textContent = msg;
    }

    function hideStatus() {
        var el = document.getElementById("status-msg");
        el.className = "status-msg";
    }

    // ──────────────────────────────────────────
    // Progress UI
    // ──────────────────────────────────────────
    function showProgress() {
        document.getElementById("progress-section").classList.add("visible");
        document.getElementById("generate-section").style.display = "none";
        document.getElementById("done-state").classList.remove("visible");
        document.getElementById("caption-preview").innerHTML = "";
    }

    function hideProgress() {
        document.getElementById("progress-section").classList.remove("visible");
    }

    function setProgressStep(text) {
        document.getElementById("progress-step-text").textContent = text;
    }

    function setProgressBar(percent) {
        document.getElementById("progress-bar").style.width = percent + "%";
    }

    function addCaptionPreview(caption) {
        var container = document.getElementById("caption-preview");
        var existingItems = container.querySelectorAll(".caption-preview-item");
        if (existingItems.length >= 3) return; // Only show first 3

        var item = document.createElement("div");
        item.className = "caption-preview-item";
        item.innerHTML =
            '<span class="time">' + formatTimeSRT(caption.start) + '</span>' +
            '<span class="text">' + escapeHTML(caption.display_text || caption.original) + '</span>';
        container.appendChild(item);
    }

    function showDone(count, details) {
        hideProgress();
        var doneState = document.getElementById("done-state");
        doneState.classList.add("visible");
        document.getElementById("done-text").textContent = count + " Captions Generated!";
        document.getElementById("done-detail").textContent = details || "";
    }

    function resetGeneration() {
        document.getElementById("done-state").classList.remove("visible");
        document.getElementById("generate-section").style.display = "block";
        hideProgress();
        hideStatus();
        cancelled = false;
    }

    // ──────────────────────────────────────────
    // Generate Captions — Main Pipeline
    // ──────────────────────────────────────────
    async function generateCaptions() {
        hideStatus();
        cancelled = false;

        // Validate inputs
        var sttProvider = document.getElementById("stt-provider").value;
        var sourceLang = document.getElementById("source-lang").value;
        var captionLangs = getSelectedPills("caption-langs");
        var outputOptions = getSelectedPills("output-options");
        var aiProvider = document.getElementById("ai-provider").value;
        var translateEnabled = document.getElementById("translate-toggle").checked;
        var translateLang = document.getElementById("translate-lang").value;

        // Validation
        if (!currentClip || !currentClip.file) {
            showStatus("error", "Select a clip first. Click 'Read Selected Clip' to load clip info.");
            return;
        }

        if (captionLangs.length === 0) {
            showStatus("error", "Select at least one caption language.");
            return;
        }

        if (outputOptions.length === 0) {
            showStatus("error", "Select at least one output option.");
            return;
        }

        // Check STT API key
        var sttKey = sttProvider === "elevenlabs" ? getApiKey("elevenlabs") : getApiKey("deepgram");
        if (!sttKey) {
            showStatus("error",
                "No API key for " + (sttProvider === "elevenlabs" ? "ElevenLabs" : "Deepgram") +
                ". Go to Settings tab to add your key.");
            return;
        }

        // Check AI API key availability
        if (!hasAnyAIKey(aiProvider)) {
            showStatus("error", "No AI provider API key available. Go to Settings to add at least one key (Gemini, Groq, or OpenRouter).");
            return;
        }

        showProgress();
        setProgressBar(5);

        try {
            // ── Step 1: Extract Audio ──
            if (cancelled) throw new Error("Cancelled");
            setProgressStep("Extracting audio…");
            setProgressBar(10);

            var tempDir = await evalScriptAsync("getTempDir()");
            var audioPath = tempDir.replace(/\\/g, "/") + "/captionizer_audio.mp3";

            var extractResult = await evalScriptAsync(
                'extractAudio("' + escapeJSX(currentClip.file) + '", "' + escapeJSX(audioPath) + '")'
            );
            var extractData = JSON.parse(extractResult);
            if (!extractData.success) {
                if (extractData.error && extractData.error.indexOf("ffmpeg") !== -1) {
                    throw new Error("FFmpeg not installed. Download from ffmpeg.org and add to PATH.");
                }
                throw new Error("Audio extraction failed: " + (extractData.error || extractData.output));
            }

            setProgressBar(25);

            // ── Step 2: Read Audio as Base64 ──
            if (cancelled) throw new Error("Cancelled");
            setProgressStep("Reading audio file…");

            var audioBase64 = await evalScriptAsync('readFileAsBase64("' + escapeJSX(audioPath) + '")');
            if (audioBase64.charAt(0) === "{") {
                var readErr = JSON.parse(audioBase64);
                if (readErr.error) throw new Error(readErr.error);
            }

            setProgressBar(30);

            // ── Step 3: Run STT ──
            if (cancelled) throw new Error("Cancelled");
            var providerName = sttProvider === "elevenlabs" ? "ElevenLabs Scribe" : "Deepgram Nova-2";
            setProgressStep("Transcribing with " + providerName + "…");

            var segments = await runSTT(audioBase64, sttProvider, sourceLang, sttKey);
            setProgressBar(50);

            if (!segments || segments.length === 0) {
                throw new Error("No speech detected in the audio. Check the clip and try again.");
            }

            // ── Step 4: Convert Script ──
            if (cancelled) throw new Error("Cancelled");
            setProgressStep("Converting to " + captionLangs.join(", ") + "…");

            segments = await convertScript(segments, captionLangs, aiProvider);
            setProgressBar(70);

            // Show preview of first 3
            segments.slice(0, 3).forEach(function (seg) {
                addCaptionPreview(seg);
            });

            // ── Step 5: Translate (if enabled) ──
            if (translateEnabled && !cancelled) {
                setProgressStep("Translating to " + translateLang + "…");
                segments = await translateCaptions(segments, translateLang, aiProvider);
                setProgressBar(80);
            }

            // Determine display_text for each segment
            var primaryLang = captionLangs[0];
            segments.forEach(function (seg) {
                seg.display_text = seg[primaryLang] || seg.original;
            });

            // ── Step 6: Output — Text Layers ──
            if (outputOptions.includes("text_layers") && !cancelled) {
                setProgressStep("Creating AE text layers…");
                var layerResult = await evalScriptAsync(
                    "createTextLayers('" + escapeJSXString(JSON.stringify(segments)) + "')"
                );
                var layerData = JSON.parse(layerResult);
                if (layerData.error) {
                    showStatus("warning", layerData.error);
                }
                setProgressBar(90);
            }

            // ── Step 7: Output — SRT Export ──
            var srtPath = "";
            if (outputOptions.includes("srt_export") && !cancelled) {
                setProgressStep("Exporting SRT file…");
                var projectFolder = await evalScriptAsync("getProjectFolder()");
                var srtResult = await evalScriptAsync(
                    "exportSRT('" + escapeJSXString(JSON.stringify(segments)) + "', '" + escapeJSX(projectFolder) + "')"
                );
                var srtData = JSON.parse(srtResult);
                if (srtData.error) {
                    showStatus("warning", "SRT export error: " + srtData.error);
                } else {
                    srtPath = srtData.path;
                }
                setProgressBar(95);
            }

            // ── Done ──
            setProgressBar(100);
            setProgressStep("Done!");

            var details = [];
            if (outputOptions.includes("text_layers")) details.push("Text layers added to composition");
            if (srtPath) details.push("SRT saved: " + srtPath);

            setTimeout(function () {
                showDone(segments.length, details.join(" · "));
            }, 500);

        } catch (err) {
            hideProgress();
            document.getElementById("generate-section").style.display = "block";
            if (err.message === "Cancelled") {
                showStatus("warning", "Generation cancelled.");
            } else {
                showStatus("error", err.message);
            }
        }
    }

    // ──────────────────────────────────────────
    // STT — Speech to Text
    // ──────────────────────────────────────────
    async function runSTT(audioBase64, provider, sourceLang, apiKey) {
        // Decode base64 to binary
        var binaryString = atob(audioBase64);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        var audioBlob = new Blob([bytes], { type: "audio/mpeg" });

        var words = [];

        if (provider === "elevenlabs") {
            words = await sttElevenLabs(audioBlob, apiKey, sourceLang);
        } else if (provider === "deepgram") {
            words = await sttDeepgram(audioBlob, apiKey, sourceLang);
        }

        // Group words into segments (6–8 words or gap > 1.5s)
        return groupWordsIntoSegments(words);
    }

    async function sttElevenLabs(audioBlob, apiKey, sourceLang) {
        var formData = new FormData();
        formData.append("audio", audioBlob, "audio.mp3");
        formData.append("model_id", "scribe_v1");
        if (sourceLang && sourceLang !== "auto") {
            formData.append("language_code", sourceLang);
        }

        var resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
            method: "POST",
            headers: { "xi-api-key": apiKey },
            body: formData
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("ElevenLabs STT error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        // data.words: [{text, start, end, ...}]
        if (data.words && data.words.length > 0) {
            return data.words.map(function (w) {
                return { word: w.text, start: w.start, end: w.end };
            });
        }
        // Fallback: split text by words with estimated timing
        if (data.text) {
            return estimateWordTimings(data.text, 0, data.duration || 60);
        }
        return [];
    }

    async function sttDeepgram(audioBlob, apiKey, sourceLang) {
        var lang = (sourceLang && sourceLang !== "auto") ? sourceLang : "en";
        var url = "https://api.deepgram.com/v1/listen?model=nova-2&language=" + lang +
                  "&timestamps=true&utterances=true";

        var resp = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": "Token " + apiKey,
                "Content-Type": "audio/mpeg"
            },
            body: audioBlob
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("Deepgram STT error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        var words = [];
        try {
            var dgWords = data.results.channels[0].alternatives[0].words;
            words = dgWords.map(function (w) {
                return { word: w.word, start: w.start, end: w.end };
            });
        } catch (e) {
            throw new Error("Deepgram returned unexpected format.");
        }
        return words;
    }

    // ──────────────────────────────────────────
    // Word → Segment Grouping
    // ──────────────────────────────────────────
    function groupWordsIntoSegments(words) {
        if (!words || words.length === 0) return [];

        var segments = [];
        var currentWords = [];
        var segStart = words[0].start;

        for (var i = 0; i < words.length; i++) {
            currentWords.push(words[i].word);

            var isLast = (i === words.length - 1);
            var gap = !isLast ? (words[i + 1].start - words[i].end) : 0;
            var wordCount = currentWords.length;

            // Break segment if: 8 words, gap > 1.5s, or last word
            if (wordCount >= 8 || gap > 1.5 || isLast || (wordCount >= 6 && gap > 0.8)) {
                segments.push({
                    start: segStart,
                    end: words[i].end,
                    original: currentWords.join(" ")
                });
                currentWords = [];
                if (!isLast) {
                    segStart = words[i + 1].start;
                }
            }
        }

        return segments;
    }

    function estimateWordTimings(text, startTime, totalDuration) {
        var words = text.split(/\s+/).filter(function (w) { return w.length > 0; });
        var avgDuration = totalDuration / words.length;
        return words.map(function (w, i) {
            return {
                word: w,
                start: startTime + i * avgDuration,
                end: startTime + (i + 1) * avgDuration
            };
        });
    }

    // ──────────────────────────────────────────
    // AI Script Conversion
    // ──────────────────────────────────────────
    async function convertScript(segments, captionLanguages, aiProvider) {
        var results = [];
        var batchSize = 5;

        for (var i = 0; i < segments.length; i += batchSize) {
            if (cancelled) throw new Error("Cancelled");

            var batch = segments.slice(i, i + batchSize);
            var batchTexts = batch.map(function (s) { return s.original; });

            var prompt = buildConversionPrompt(batchTexts, captionLanguages);

            var aiResult = await callAI(prompt, aiProvider);
            var parsed = parseAIResponse(aiResult);

            // parsed should be an array matching batchTexts
            for (var j = 0; j < batch.length; j++) {
                var seg = Object.assign({}, batch[j]);
                if (parsed && parsed[j]) {
                    captionLanguages.forEach(function (lang) {
                        var key = langToKey(lang);
                        if (parsed[j][key]) {
                            seg[key] = parsed[j][key];
                        }
                    });
                }
                // Set display_text to first requested language
                var primaryKey = langToKey(captionLanguages[0]);
                seg.display_text = seg[primaryKey] || seg.original;
                results.push(seg);
            }

            // Update progress within conversion step
            var convProgress = 50 + (20 * (i + batch.length) / segments.length);
            setProgressBar(Math.min(convProgress, 70));
        }

        return results;
    }

    function langToKey(lang) {
        var map = {
            "telugu_script": "telugu",
            "tenglish": "tenglish",
            "hinglish": "hinglish",
            "tamil_script": "tamil",
            "english": "english"
        };
        return map[lang] || lang;
    }

    function buildConversionPrompt(texts, captionLanguages) {
        var tasks = [];
        captionLanguages.forEach(function (lang) {
            switch (lang) {
                case "tenglish":
                    tasks.push('- "tenglish": convert to phonetic English romanisation of Telugu (e.g. నేను → nenu, యువరాజ్ → Yuvaraj). Keep English words as-is.');
                    break;
                case "hinglish":
                    tasks.push('- "hinglish": convert to phonetic English romanisation of Hindi. Keep English words as-is.');
                    break;
                case "telugu_script":
                    tasks.push('- "telugu": keep original Telugu script unchanged.');
                    break;
                case "tamil_script":
                    tasks.push('- "tamil": keep original Tamil script unchanged.');
                    break;
                case "english":
                    tasks.push('- "english": translate to natural English.');
                    break;
            }
        });

        var inputLines = texts.map(function (t, i) { return (i + 1) + ". \"" + t + "\""; }).join("\n");

        return "You are a caption converter for South Indian language videos.\n\n" +
            "Input texts (numbered):\n" + inputLines + "\n\n" +
            "For each numbered input, perform these conversions:\n" +
            tasks.join("\n") + "\n\n" +
            "Return ONLY a JSON array where each element corresponds to an input text.\n" +
            "Each element should be an object with only the requested keys.\n" +
            "Example format: [{\"tenglish\": \"...\", \"english\": \"...\"}, ...]\n" +
            "Include only the keys that were requested. No markdown fences, no explanation.";
    }

    // ──────────────────────────────────────────
    // AI Provider Calls
    // ──────────────────────────────────────────
    async function callAI(prompt, provider) {
        if (provider === "auto") {
            return await callAIAuto(prompt);
        }

        switch (provider) {
            case "gemini": return await callGemini(prompt);
            case "groq": return await callGroq(prompt);
            case "openrouter": return await callOpenRouter(prompt);
            default: throw new Error("Unknown AI provider: " + provider);
        }
    }

    async function callAIAuto(prompt) {
        var errors = [];

        // Try Gemini first
        if (getApiKey("gemini")) {
            try { return await callGemini(prompt); }
            catch (e) { errors.push("Gemini: " + e.message); }
        }

        // Try Groq
        if (getApiKey("groq")) {
            try { return await callGroq(prompt); }
            catch (e) { errors.push("Groq: " + e.message); }
        }

        // Try OpenRouter
        if (getApiKey("openrouter")) {
            try { return await callOpenRouter(prompt); }
            catch (e) { errors.push("OpenRouter: " + e.message); }
        }

        throw new Error("All AI providers failed:\n" + errors.join("\n"));
    }

    async function callGemini(prompt) {
        var key = getApiKey("gemini");
        if (!key) throw new Error("Gemini API key not set.");

        var resp = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4096
                    }
                })
            }
        );

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("Gemini API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.candidates[0].content.parts[0].text;
    }

    async function callGroq(prompt) {
        var key = getApiKey("groq");
        if (!key) throw new Error("Groq API key not set.");

        var resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 4096
            })
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("Groq API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.choices[0].message.content;
    }

    async function callOpenRouter(prompt) {
        var key = getApiKey("openrouter");
        if (!key) throw new Error("OpenRouter API key not set.");

        var resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "mistralai/mistral-7b-instruct:free",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 4096
            })
        });

        if (!resp.ok) {
            var errText = await resp.text();
            throw new Error("OpenRouter API error (" + resp.status + "): " + errText);
        }

        var data = await resp.json();
        return data.choices[0].message.content;
    }

    function hasAnyAIKey(provider) {
        if (provider === "auto") {
            return getApiKey("gemini") || getApiKey("groq") || getApiKey("openrouter");
        }
        switch (provider) {
            case "gemini": return !!getApiKey("gemini");
            case "groq": return !!getApiKey("groq");
            case "openrouter": return !!getApiKey("openrouter");
        }
        return false;
    }

    // ──────────────────────────────────────────
    // AI Response Parsing
    // ──────────────────────────────────────────
    function parseAIResponse(text) {
        if (!text) return null;

        // Strip markdown code fences if present
        text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

        try {
            var parsed = JSON.parse(text);
            // If it's a single object, wrap in array
            if (!Array.isArray(parsed)) {
                parsed = [parsed];
            }
            return parsed;
        } catch (e) {
            // Try to extract JSON from the text
            var match = text.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (e2) { /* fall through */ }
            }
            // Try single object
            var objMatch = text.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try {
                    return [JSON.parse(objMatch[0])];
                } catch (e3) { /* fall through */ }
            }
            console.warn("Failed to parse AI response:", text);
            return null;
        }
    }

    // ──────────────────────────────────────────
    // Translation
    // ──────────────────────────────────────────
    async function translateCaptions(segments, targetLang, aiProvider) {
        var langNames = { "en": "English", "te": "Telugu", "hi": "Hindi", "ta": "Tamil" };
        var targetLangName = langNames[targetLang] || targetLang;

        var batchSize = 5;
        var results = [];

        for (var i = 0; i < segments.length; i += batchSize) {
            if (cancelled) throw new Error("Cancelled");

            var batch = segments.slice(i, i + batchSize);
            var texts = batch.map(function (s) { return s.display_text || s.original; });

            var prompt = "Translate the following captions to " + targetLangName + ".\n\n" +
                texts.map(function (t, idx) { return (idx + 1) + ". \"" + t + "\""; }).join("\n") +
                "\n\nReturn ONLY a JSON array of translated strings. No explanation.\n" +
                "Example: [\"translated 1\", \"translated 2\"]";

            var aiResult = await callAI(prompt, aiProvider);
            var parsed = parseAIResponse(aiResult);

            for (var j = 0; j < batch.length; j++) {
                var seg = Object.assign({}, batch[j]);
                if (parsed && parsed[j]) {
                    var translated = typeof parsed[j] === "string" ? parsed[j] : (parsed[j].translation || parsed[j].text || JSON.stringify(parsed[j]));
                    seg.display_text = translated;
                    seg.translated = translated;
                }
                results.push(seg);
            }
        }

        return results;
    }

    // ──────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────
    function getSelectedPills(containerId) {
        var pills = document.querySelectorAll("#" + containerId + " .pill.active");
        var values = [];
        pills.forEach(function (p) {
            values.push(p.getAttribute("data-lang") || p.getAttribute("data-output"));
        });
        return values;
    }

    function evalScriptAsync(script) {
        return new Promise(function (resolve, reject) {
            if (!csInterface) {
                reject(new Error("Not running inside After Effects."));
                return;
            }
            csInterface.evalScript(script, function (result) {
                if (result === EvalScript_ErrMessage || result === "EvalScript error.") {
                    reject(new Error("ExtendScript error: " + script));
                } else {
                    resolve(result);
                }
            });
        });
    }

    function escapeJSX(str) {
        return str.replace(/\\/g, "/").replace(/"/g, '\\"');
    }

    function escapeJSXString(str) {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
    }

    function escapeHTML(str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatTimeSRT(seconds) {
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

})();
