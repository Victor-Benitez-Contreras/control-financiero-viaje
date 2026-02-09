const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./index.js');

const GROUP_NAME = 'Finanzas Viaje 2026';

// Check if running in Docker to adjust Puppeteer args
const isDocker = process.env.DOCKER_ENV === 'true';

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: isDocker ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : []
    }
});

client.on('qr', (qr) => {
    console.log('--- POR FAVOR ESCANEA EL CÓDIGO QR PARA INICIAR SESIÓN ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('--- EL BOT DE FINANZAS ESTÁ LISTO Y CONECTADO ---');
});

client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();

        // Context check: Must be in the specific group
        if (chat.name === GROUP_NAME) {
            const response = handleMessage(msg.body, chat.name);

            if (response) {
                await msg.reply(response);
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

client.initialize();
