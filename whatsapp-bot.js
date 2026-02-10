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

client.on('ready', async () => {
    console.log('--- EL BOT DE FINANZAS ESTÁ LISTO Y CONECTADO ---');

    // Prueba automática de envío al grupo al iniciar
    const chats = await client.getChats();
    const target = chats.find(c => c.name.toLowerCase().trim() === GROUP_NAME.toLowerCase().trim());

    if (target) {
        console.log(`[TEST] Enviando mensaje de saludo a: "${target.name}"`);
        await client.sendMessage(target.id._serialized, '🤖 Bot de Finanzas activo y listo para el viaje.');
    } else {
        console.log(`[ADVERTENCIA] No encontré el grupo "${GROUP_NAME}" en los chats recientes.`);
    }

    console.log('-------------------------------------------');
});

client.on('message_create', async (msg) => {
    try {
        const chat = await msg.getChat();

        // REGLA DE ORO: Log de TODO para ver qué llega
        console.log(`\n[DEBUG] Registro de mensaje:`);
        console.log(` - De: "${chat.name}"`);
        console.log(` - Texto: "${msg.body}"`);
        console.log(` - ID: ${chat.id._serialized}`);

        const isTargetGroup = chat.name.toLowerCase().trim() === GROUP_NAME.toLowerCase().trim();

        if (isTargetGroup) {
            console.log('--- ¡COINCIDENCIA DE GRUPO! ---');
            const response = handleMessage(msg.body, GROUP_NAME);

            if (response) {
                console.log(`[OK] Generando respuesta: ${response}`);
                await client.sendMessage(chat.id._serialized, response);
                console.log('[OK] Respuesta enviada con éxito');
            } else {
                console.log('[INFO] El mensaje no coincide con los comandos (Gaste/Balance)');
            }
        } else {
            // Comando de prueba global
            if (msg.body.toLowerCase() === 'ping') {
                await client.sendMessage(chat.id._serialized, '¡Pong! El bot está vivo pero el filtro de grupo te ignora.');
            }
        }
    } catch (error) {
        console.error('[ERROR] Fallo en el procesamiento de mensaje:', error);
    }
});

client.initialize();
