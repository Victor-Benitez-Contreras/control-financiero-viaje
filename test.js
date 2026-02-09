const { handleMessage, FinancialController } = require('./index.js');
const fs = require('fs');
const path = require('path');

/**
 * Mocks the bot environment to verify logic
 */
function test() {
    console.log("--- Starting Verification ---");

    // Reset state for testing
    const initialState = {
        balance_acumulado: 0.0,
        estados_diarios: {}
    };
    fs.writeFileSync(path.join(__dirname, 'estado.json'), JSON.stringify(initialState, null, 2));
    fs.writeFileSync(path.join(__dirname, 'logs.json'), JSON.stringify([], null, 2));

    const group = 'Finanzas Viaje 2026';

    const testCases = [
        "Gasté 30 euros en Madrid, día 1",
        "Gasté 25 euros en Madrid, día 1",
        "Balance",
        "Gasté 100 euros en Paris, día 1",
        "Balance"
    ];

    testCases.forEach(msg => {
        console.log(`\nUser: "${msg}"`);
        const response = handleMessage(msg, group);
        console.log(`Bot: "${response}"`);
    });

    console.log("\n--- Verification Finished ---");
}

test();
