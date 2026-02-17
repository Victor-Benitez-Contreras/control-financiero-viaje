const fs = require('fs');
const path = require('path');
const { FinancialController } = require('./index.js');

const TEMP_DIR = path.join(__dirname, 'verify_tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const config = {
    presupuesto: path.join(TEMP_DIR, 'presupuesto.json'),
    estado: path.join(TEMP_DIR, 'estado.json'),
    logs: path.join(TEMP_DIR, 'logs.json')
};

// Initialize mock data
fs.writeFileSync(config.presupuesto, JSON.stringify({
    configuracion: { presupuesto_random: 500 },
    presupuesto_diario: {}
}));
fs.writeFileSync(config.estado, JSON.stringify({ estados_diarios: {}, balance_acumulado: 0 }));
fs.writeFileSync(config.logs, JSON.stringify([]));

try {
    const controller = new FinancialController(config);
    const result = controller.registerRandomExpense(50);

    console.log("Result:", result);

    if (!result.includes("Te quedan 450.00 euros")) {
        throw new Error("Incorrect result message");
    }

    const savedState = JSON.parse(fs.readFileSync(config.estado, 'utf8'));
    if (savedState.random_remanente !== 450) {
        throw new Error("Incorrect random_remanente in state");
    }

    console.log("VERIFICATION SUCCESS");
} catch (error) {
    console.error("VERIFICATION FAILED:", error);
    process.exit(1);
} finally {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
