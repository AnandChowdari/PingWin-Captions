/**
 * host.jsx — ExtendScript for Adobe After Effects & Premiere Pro
 * Captionizer CEP Plugin
 * 
 * Runs inside the host application scripting engine. All functions are called
 * from main.js via CSInterface.evalScript().
 */

/**
 * App detection helpers
 */
function isAfterEffects() {
    return (typeof app.project !== "undefined" && typeof app.project.activeItem !== "undefined");
}

function isPremiere() {
    return (typeof app.project !== "undefined" && typeof app.project.activeSequence !== "undefined");
}

/**
 * Get information about the currently active/selected item in the project.
 * Works dynamically in both After Effects and Premiere Pro.
 * Returns JSON string with clip metadata.
 */
function getActiveClipInfo() {
    if (isAfterEffects()) {
        var item = app.project.activeItem;

        // If there's a comp open, check selected items within it
        if (item && item instanceof CompItem) {
            var selectedLayers = item.selectedLayers;
            if (selectedLayers.length > 0) {
                var layer = selectedLayers[0];
                var source = layer.source;
                if (source && source instanceof FootageItem && source.file) {
                    return JSON.stringify({
                        name: source.name,
                        file: source.file.fsName,
                        duration: source.duration,
                        frameRate: source.frameRate || 0,
                        compName: item.name,
                        layerName: layer.name
                    });
                }
                // Layer without file source
                return JSON.stringify({
                    name: layer.name,
                    file: "",
                    duration: layer.outPoint - layer.inPoint,
                    frameRate: item.frameRate,
                    compName: item.name,
                    layerName: layer.name
                });
            }
            // Comp is active but no layer selected
            return JSON.stringify({
                name: item.name,
                file: "",
                duration: item.duration,
                frameRate: item.frameRate,
                compName: item.name,
                layerName: "",
                info: "Composition active, no layer selected"
            });
        }

        // Check if a footage item is selected in the Project panel
        if (item && item instanceof FootageItem) {
            return JSON.stringify({
                name: item.name,
                file: item.file ? item.file.fsName : "",
                duration: item.duration,
                frameRate: item.frameRate || 0
            });
        }

        return JSON.stringify({ error: "No footage or composition selected. Select a clip in the Project panel or a layer in the Timeline." });

    } else if (isPremiere()) {
        // Premiere Pro selection detection
        
        // 1. Check timeline sequence selection first
        var seq = app.project.activeSequence;
        if (seq) {
            var selectedClips = seq.getSelection();
            if (selectedClips && selectedClips.length > 0) {
                var clip = selectedClips[0];
                var projectItem = clip.projectItem;
                if (projectItem) {
                    var path = projectItem.getMediaPath();
                    return JSON.stringify({
                        name: clip.name,
                        file: path || "",
                        duration: clip.end.seconds - clip.start.seconds,
                        frameRate: projectItem.getFPS ? projectItem.getFPS() : 0,
                        sequenceName: seq.name,
                        layerName: clip.name
                    });
                }
            }
        }

        // 2. Fall back to Project Panel selection
        if (app.project.selection && app.project.selection.length > 0) {
            var selectedItem = app.project.selection[0];
            // ProjectItemType.FILE is 1
            if (selectedItem && selectedItem.type === 1) {
                return JSON.stringify({
                    name: selectedItem.name,
                    file: selectedItem.getMediaPath() || "",
                    duration: selectedItem.getInPoint ? (selectedItem.getOutPoint().seconds - selectedItem.getInPoint().seconds) : 0,
                    frameRate: selectedItem.getFPS ? selectedItem.getFPS() : 0
                });
            }
        }

        return JSON.stringify({ error: "No clip selected. Select a clip in your Timeline sequence or an item in your Project bin." });
    }

    return JSON.stringify({ error: "Unsupported Adobe host application context." });
}

/**
 * Read a file and return its contents as Base64.
 * @param {string} filePath - Full path to the file to read
 * @returns {string} Base64-encoded file contents
 */
function readFileAsBase64(filePath) {
    try {
        var file = new File(filePath);
        if (!file.exists) {
            return JSON.stringify({ error: "File not found: " + filePath });
        }
        file.encoding = "BINARY";
        file.open("r");
        var content = file.read();
        file.close();

        // Manual Base64 encoding for ExtendScript
        var b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var b64 = "";
        var i = 0;
        while (i < content.length) {
            var byte1 = content.charCodeAt(i++) & 0xFF;
            var byte2 = i < content.length ? content.charCodeAt(i++) & 0xFF : 0;
            var byte3 = i < content.length ? content.charCodeAt(i++) & 0xFF : 0;

            var enc1 = byte1 >> 2;
            var enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
            var enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
            var enc4 = byte3 & 63;

            if (i - 2 > content.length) { enc3 = 64; enc4 = 64; }
            else if (i - 1 > content.length) { enc4 = 64; }

            b64 += b64chars.charAt(enc1) + b64chars.charAt(enc2);
            b64 += (enc3 === 64 ? "=" : b64chars.charAt(enc3));
            b64 += (enc4 === 64 ? "=" : b64chars.charAt(enc4));
        }
        return b64;
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Create text layers in the active composition from caption data. (After Effects only)
 * @param {string} captionsJSON - JSON string of caption objects array
 * @returns {string} Result message
 */
function createTextLayers(captionsJSON) {
    try {
        if (!isAfterEffects()) {
            return JSON.stringify({ error: "Text layer creation is only supported natively in After Effects." });
        }

        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ error: "No composition active. Please activate the composition containing your clip." });
        }

        var captions = JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return JSON.stringify({ error: "No captions to create." });
        }

        app.beginUndoGroup("Captionizer - Create Text Layers");

        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";

            if (displayText === "") continue;

            var textLayer = comp.layers.addText(displayText);
            textLayer.inPoint = caption.start;
            textLayer.outPoint = caption.end;

            // Style the text
            var textProp = textLayer.property("Source Text");
            var textDoc = textProp.value;
            textDoc.fontSize = 48;
            textDoc.fillColor = [1, 1, 1]; // white
            textDoc.font = "Arial";
            textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
            textDoc.applyStroke = true;
            textDoc.strokeColor = [0, 0, 0]; // black stroke for readability
            textDoc.strokeWidth = 2;
            textProp.setValue(textDoc);

            // Position at bottom center
            textLayer.property("Position").setValue([comp.width / 2, comp.height * 0.85]);

            // Name the layer for easy identification
            textLayer.name = "Caption " + (i + 1);
        }

        app.endUndoGroup();

        return JSON.stringify({ success: true, count: captions.length });
    } catch (e) {
        if (isAfterEffects()) {
            app.endUndoGroup();
        }
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Import a generated file directly into the Premiere Pro project bin. (Premiere Pro only)
 * @param {string} filePath - Absolute path to the file to import
 * @returns {string} Result message
 */
function importFileToProject(filePath) {
    try {
        if (isPremiere()) {
            var files = [filePath];
            app.project.importFiles(files, true, null, false);
            return JSON.stringify({ success: true, path: filePath });
        }
        return JSON.stringify({ error: "Project file import is only supported in Premiere Pro." });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Export captions as an SRT file.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @param {string} folderPath - Folder path to save the SRT file
 * @returns {string} Result message
 */
function exportSRT(captionsJSON, folderPath, filename) {
    try {
        var captions = JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return JSON.stringify({ error: "No captions to export." });
        }

        var srtContent = "";
        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";
            srtContent += (i + 1) + "\n";
            srtContent += formatSRTTime(caption.start) + " --> " + formatSRTTime(caption.end) + "\n";
            srtContent += displayText + "\n\n";
        }

        var finalName = filename || "captions.srt";
        var filePath = folderPath + "/" + finalName;
        var file = new File(filePath);
        file.encoding = "UTF-8";
        file.open("w");
        file.write("\uFEFF" + srtContent); // Add UTF-8 BOM
        file.close();

        return JSON.stringify({ success: true, path: file.fsName });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Prompt user for save location and export captions as an SRT file.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @param {string} defaultFilename - Suggested filename
 * @returns {string} Result message
 */
function exportSRTWithDialog(captionsJSON, defaultFilename) {
    try {
        var captions = JSON.parse(captionsJSON);
        if (!captions || captions.length === 0) {
            return JSON.stringify({ error: "No captions to export." });
        }

        var defaultFile = new File(Folder.myDocuments.fsName + "/" + (defaultFilename || "captions.srt"));
        var saveFile = defaultFile.saveDlg("Save SRT File", "SubRip Subtitle files:*.srt");

        if (!saveFile) {
            return JSON.stringify({ cancelled: true });
        }

        var srtContent = "";
        for (var i = 0; i < captions.length; i++) {
            var caption = captions[i];
            var displayText = caption.display_text || caption.original || "";
            srtContent += (i + 1) + "\n";
            srtContent += formatSRTTime(caption.start) + " --> " + formatSRTTime(caption.end) + "\n";
            srtContent += displayText + "\n\n";
        }

        saveFile.encoding = "UTF-8";
        saveFile.open("w");
        saveFile.write("\uFEFF" + srtContent); // Add UTF-8 BOM
        saveFile.close();

        return JSON.stringify({ success: true, path: saveFile.fsName });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
 * @param {number} totalSeconds - Time in seconds
 * @returns {string} Formatted SRT time string
 */
function formatSRTTime(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);
    var millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

    function pad(num, size) {
        var s = "000" + num;
        return s.substr(s.length - size);
    }

    return pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "," + pad(millis, 3);
}

/**
 * Get the system temp directory path.
 * @returns {string} Path to system temp directory
 */
function getTempDir() {
    var tempDir = Folder.temp.fsName;
    return tempDir;
}

/**
 * Get the project folder path (for SRT export).
 * Works for both Premiere Pro and After Effects.
 * @returns {string} Path to the project folder
 */
function getProjectFolder() {
    // 1. Premiere Pro
    if (typeof app.project !== "undefined" && typeof app.project.path !== "undefined" && app.project.path) {
        var pPath = app.project.path;
        var lastSlash = pPath.lastIndexOf("/");
        if (lastSlash === -1) lastSlash = pPath.lastIndexOf("\\");
        if (lastSlash !== -1) {
            return pPath.substring(0, lastSlash);
        }
        return pPath;
    }
    // 2. After Effects
    if (typeof app.project !== "undefined" && app.project.file) {
        return app.project.file.parent.fsName;
    }
    // Fallback to user documents
    return Folder.myDocuments.fsName;
}
