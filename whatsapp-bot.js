const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./index.js');

const GROUP_NAME = 'Finanzas Viaje 2026';

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // ¡CRÍTICO para ahorrar RAM!
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('--- POR FAVOR ESCANEA EL CÓDIGO QR PARA INICIAR SESIÓN ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('--- EL BOT DE FINANZAS ESTÁ LISTO Y CONECTADO ---');
});

client.on('message_create', async (msg) => {
    try {
        // Ignorar si es una respuesta del propio bot para evitar bucles
        if (msg.body.includes('🤖 Bot de Finanzas') ||
            msg.body.includes('has ahorrado') ||
            msg.body.includes('te quedan')) return;

        const chat = await msg.getChat();
        const isTargetGroup = chat.name.toLowerCase().trim() === GROUP_NAME.toLowerCase().trim();

        if (isTargetGroup) {
            console.log(`[MSG] Recibido en grupo de: ${msg.fromMe ? 'MI' : 'OTRO'}: ${msg.body}`);
            const response = handleMessage(msg.body, GROUP_NAME);

            if (response) {
                console.log(`[REP] Respondiendo a ${chat.id._serialized}`);
                await client.sendMessage(chat.id._serialized, response);
            }
        }
    } catch (error) {
        console.error('[ERR]', error.message);
    }
});

client.initialize();
