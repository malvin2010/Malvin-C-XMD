import pkg from '@whiskeysockets/baileys';
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeInMemoryStore, 
    jidDecode 
} = pkg;
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    const client = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ["Malvin C XMD", "Chrome", "1.0.0"]
    });

    store.bind(client.ev);

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red("Device Logged Out, Please Scan Again."));
            } else {
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('Connected to WhatsApp Successfully ✅'));
            console.log(chalk.cyan('Powered by Handsome Tech 🇿🇼'));
        }
    });

    client.ev.on('creds.update', saveCreds);

    client.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            const from = mek.key.remoteJid;
            const type = Object.keys(mek.message)[0];
            const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type === 'imageMessage') ? mek.message.imageMessage.caption : (type === 'videoMessage') ? mek.message.videoMessage.caption : '';
            
            const prefix = ".";
            const isCmd = body.startsWith(prefix);
            const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
            const args = body.trim().split(/ +/).slice(1);
            const text = args.join(' ');

            if (isCmd) {
                const cmdPath = path.join(__dirname, 'commands', `${command}.js`);
                if (fs.existsSync(cmdPath)) {
                    const { default: cmd } = await import(`file://${cmdPath}`);
                    await cmd(client, mek, { args, text, from });
                }
            }
        } catch (err) {
            console.error(err);
        }
    });
}

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(chalk.yellow(`Server running on port ${port}`));
});

startBot();
