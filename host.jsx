/**
 * host.jsx — ExtendScript for Adobe After Effects
 * Captionizer CEP Plugin
 * 
 * Runs inside the AE scripting engine. All functions are called
 * from main.js via CSInterface.evalScript().
 */

/**
 * Get information about the currently active/selected item in the project.
 * Returns JSON string with clip metadata.
 */
function getActiveClipInfo() {
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
}

/**
 * Extract audio from a video file using FFmpeg.
 * @param {string} inputPath - Full path to the source video file
 * @param {string} outputPath - Full path for the output MP3 file
 * @returns {string} Result message
 */
function extractAudio(inputPath, outputPath) {
    try {
        var cmd = 'ffmpeg -i "' + inputPath + '" -vn -ar 16000 -ac 1 -b:a 64k -y "' + outputPath + '"';
        var result = system.callSystem(cmd);
        return JSON.stringify({ success: true, output: result, path: outputPath });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
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
 * Create text layers in the active composition from caption data.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @returns {string} Result message
 */
function createTextLayers(captionsJSON) {
    try {
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
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Export captions as an SRT file.
 * @param {string} captionsJSON - JSON string of caption objects array
 * @param {string} folderPath - Folder path to save the SRT file
 * @returns {string} Result message
 */
function exportSRT(captionsJSON, folderPath) {
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

        var filePath = folderPath + "/captions.srt";
        var file = new File(filePath);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(srtContent);
        file.close();

        return JSON.stringify({ success: true, path: file.fsName });
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
 * @returns {string} Path to the project folder
 */
function getProjectFolder() {
    var projectFile = app.project.file;
    if (projectFile) {
        return projectFile.parent.fsName;
    }
    // Fallback to user documents
    return Folder.myDocuments.fsName;
}

/**
 * Check if FFmpeg is available on the system.
 * @returns {string} JSON result
 */
function checkFFmpeg() {
    try {
        var result = system.callSystem("ffmpeg -version");
        if (result && result.indexOf("ffmpeg version") !== -1) {
            return JSON.stringify({ available: true });
        }
        return JSON.stringify({ available: false });
    } catch (e) {
        return JSON.stringify({ available: false, error: e.toString() });
    }
}
