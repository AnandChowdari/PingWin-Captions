/**
 * server.js — Licensing Authentication & Email Delivery Server
 * 
 * A self-contained Express server for PingWin Captions plugin authentication.
 * Manages database keys in a local JSON database and emails license keys 
 * automatically using Nodemailer SMTP.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'licenses.json');

app.use(express.json());

// Enable CORS for CEP extensions (which execute from local file origins)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Configure SMTP transport for sending automated emails
// IMPORTANT: Update these credentials with your actual email service settings (e.g. Gmail, Resend, SendGrid)
const mailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Replace with your SMTP host
    port: 465,              // Secure SMTP port
    secure: true,           // Use SSL
    auth: {
        user: 'your-email@gmail.com',  // Replace with your email address
        pass: 'your-smtp-password'     // Replace with your email App Password
    }
});

// Helper: Read the JSON database
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            // Seed a sample license for developer testing
            const defaultDb = {
                licenses: [
                    {
                        email: 'test@customer.com',
                        licenseKey: 'PWC-ABCD-1234-EFGH',
                        active: true,
                        createdAt: new Date().toISOString()
                    }
                ]
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 4));
            return defaultDb;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Database read error:", e);
        return { licenses: [] };
    }
}

// Helper: Write to the JSON database
function writeDatabase(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
        return true;
    } catch (e) {
        console.error("Database write error:", e);
        return false;
    }
}

// Helper: Generate a unique, formatted license key (e.g., PWC-XXXX-XXXX-XXXX)
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'PWC-';
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 2) key += '-';
    }
    return key;
}

// ──────────────────────────────────────────
// ENDPOINTS
// ──────────────────────────────────────────

/**
 * POST /api/activate
 * Front-end endpoint to activate a local extension license
 */
app.post('/api/activate', (req, res) => {
    const { email, licenseKey } = req.body;

    if (!email || !licenseKey) {
        return res.status(400).json({ error: "Email and License Key are required." });
    }

    const db = readDatabase();
    const cleanEmail = email.toLowerCase().trim();
    const cleanKey = licenseKey.toUpperCase().trim();

    const license = db.licenses.find(l => l.email === cleanEmail && l.licenseKey === cleanKey);

    if (!license) {
        return res.status(401).json({ error: "Invalid Email Address or License Key." });
    }

    if (!license.active) {
        return res.status(403).json({ error: "This license has been deactivated. Please contact support." });
    }

    // Generate a simple secure token for the plugin
    const token = crypto.createHash('sha256').update(cleanEmail + cleanKey + 'pingwin_captions_salt_2026').digest('hex');

    console.log(`[AUTH] License activated successfully for: ${cleanEmail}`);
    res.json({
        success: true,
        token: token,
        email: cleanEmail
    });
});

/**
 * POST /api/admin/create-license
 * Admin endpoint to generate a new license key and email it to the user
 */
app.post('/api/admin/create-license', async (req, res) => {
    const { email } = req.body;
    
    // Security check: Secure this endpoint with an Admin Token
    const adminToken = req.headers['authorization'];
    if (adminToken !== 'Bearer pwc_admin_secret_token_123') {
        return res.status(403).json({ error: "Unauthorized access." });
    }

    if (!email) {
        return res.status(400).json({ error: "Recipient email address is required." });
    }

    const db = readDatabase();
    const cleanEmail = email.toLowerCase().trim();

    // Check if the user already has a license
    let existing = db.licenses.find(l => l.email === cleanEmail);
    if (existing) {
        return res.status(400).json({ error: "A license key already exists for this email address." });
    }

    const key = generateLicenseKey();
    const newLicense = {
        email: cleanEmail,
        licenseKey: key,
        active: true,
        createdAt: new Date().toISOString()
    };

    db.licenses.push(newLicense);
    if (!writeDatabase(db)) {
        return res.status(500).json({ error: "Failed to write license record to database." });
    }

    console.log(`[ADMIN] License created: ${cleanEmail} -> ${key}`);

    // Compose and send email to customer
    const mailOptions = {
        from: '"PingWin Captions Support" <your-email@gmail.com>',
        to: cleanEmail,
        subject: '🐧 Your PingWin Captions License Key & Credentials',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <div style="text-align: center; border-bottom: 2px solid #00d4aa; padding-bottom: 12px; margin-bottom: 20px;">
                    <h1 style="color: #00d4aa; margin: 0; font-size: 24px;">🐧 PingWin Captions</h1>
                    <p style="color: #666; margin: 5px 0 0 0;">AI Captions for After Effects & Premiere Pro</p>
                </div>
                
                <h2 style="color: #333; font-size: 18px;">Welcome to PingWin Captions!</h2>
                <p style="color: #555; line-height: 1.5;">Your license key has been successfully created. Use the credentials below to log into the Adobe extension:</p>
                
                <div style="background-color: #f7f7f9; border-left: 4px solid #00d4aa; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="font-weight: bold; color: #444; padding: 4px 0; width: 120px;">Email:</td>
                            <td style="color: #111; font-family: monospace; font-size: 14px;">${cleanEmail}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; color: #444; padding: 4px 0;">License Key:</td>
                            <td style="color: #00d4aa; font-family: monospace; font-size: 16px; font-weight: bold;">${key}</td>
                        </tr>
                    </table>
                </div>

                <h3 style="color: #333; font-size: 14px; margin-top: 24px;">🚀 How to get started:</h3>
                <ol style="color: #555; line-height: 1.6; padding-left: 20px;">
                    <li>Open Adobe After Effects or Adobe Premiere Pro.</li>
                    <li>Go to <strong>Window &rarr; Extensions &rarr; PingWin Captions</strong>.</li>
                    <li>Enter your email and the license key above in the login screen.</li>
                    <li>Set up your ElevenLabs/Gemini API keys in the settings and start generating captions!</li>
                </ol>

                <p style="color: #888; font-size: 11px; margin-top: 30px; border-top: 1px solid #eaeaea; padding-top: 15px; text-align: center;">
                    If you have any questions or require support, please contact the PingWin Captions Administrator.<br>
                    &copy; 2026 PingWin Captions. All rights reserved.
                </p>
            </div>
        `
    };

    try {
        await mailTransporter.sendMail(mailOptions);
        console.log(`[SMTP] Activation email sent successfully to ${cleanEmail}`);
        res.json({
            success: true,
            message: "License created and emailed successfully!",
            license: newLicense
        });
    } catch (mailError) {
        console.error("[SMTP ERROR] Failed to send email:", mailError);
        res.json({
            success: true,
            message: "License created inside database, but SMTP email delivery failed. Verify transporter credentials.",
            license: newLicense,
            warning: "Email delivery failed: " + mailError.message
        });
    }
});

// Start the Server
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🐧 PingWin Captions License Server running on port ${PORT}`);
    console.log(`   - Authentication Endpoint: POST /api/activate`);
    console.log(`   - Admin Keygen Endpoint:   POST /api/admin/create-license`);
    console.log(`=================================================`);
});
