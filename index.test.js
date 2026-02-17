const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { FinancialController, handleMessage } = require('./index.js');

// Helper to setup/cleanup test environment
const TEST_DIR = path.join(__dirname, 'test_tmp');
const TEST_FILES = {
    presupuesto: path.join(TEST_DIR, 'presupuesto.json'),
    estado: path.join(TEST_DIR, 'estado.json'),
    logs: path.join(TEST_DIR, 'logs.json')
};

function setupTestEnv() {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);

    const budget = {
        presupuesto_diario: {
            "TestCity": { "dia_1": 100 }
        }
    };
    fs.writeFileSync(TEST_FILES.presupuesto, JSON.stringify(budget));
    fs.writeFileSync(TEST_FILES.estado, JSON.stringify({ balance_acumulado: 0, estados_diarios: {} }));
    fs.writeFileSync(TEST_FILES.logs, JSON.stringify([]));

    // Override index.js CONFIG_FILES for testing purposes
    // Note: Since index.js uses __dirname and hardcoded paths, we need careful handling.
    // However, for this exercise, we can trust that the FinancialController tests 
    // can be run by mocking the path logic or by temporarily moving index.js to use relative paths.
    // To keep it simple, we'll assume the current directory is fine and use a subfolder.
}

function cleanupTestEnv() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

// Since index.js loads paths at module level, we'll use a hack or just test 
// the methods by passing mock data if the design allowed. 
// Given the current design, let's create a temporary index file for testing 
// that accepts paths in the constructor or just use a helper.

test('FinancialController Logic', async (t) => {
    // Note: To properly unit test without side effects on real files, 
    // we should have designed index.js to accept config paths.
    // Let's modify index.js slightly to allow path injection if it's feasible,
    // or just mock the fs module.

    await t.test('calculateTotalBalance returns correct balance', () => {
        const controller = new FinancialController();
        // Manually inject state for isolated testing
        controller.presupuesto = {
            presupuesto_diario: {
                "Madrid": { "dia_1": 50, "dia_2": 50 }
            },
            configuracion: {}
        };
        controller.estado = {
            estados_diarios: {
                "Madrid||dia_1": 20 // Spent 30
            }
        };
        controller.logs = [
            { tipo: 'GASTO', monto: 30, ciudad: 'Madrid', dia: 1 }
        ];

        const balance = controller.calculateTotalBalance();
        assert.strictEqual(balance, 20); // 50 - 30
    });

    await t.test('calculateTotalBalance with deficit', () => {
        const controller = new FinancialController();
        controller.presupuesto = {
            presupuesto_diario: {
                "Madrid": { "dia_1": 50 }
            },
            configuracion: {}
        };
        controller.estado = {
            estados_diarios: {
                "Madrid||dia_1": -10 // Spent 60
            }
        };
        controller.logs = [
            { tipo: 'GASTO', monto: 60, ciudad: 'Madrid', dia: 1 }
        ];

        const balance = controller.calculateTotalBalance();
        assert.strictEqual(balance, -10);
    });
});

test('Message Routing with handleMessage', async (t) => {
    const group = 'Finanzas Viaje 2026';
    const wrongGroup = 'Other Group';

    await t.test('ignores messages from wrong group', () => {
        const result = handleMessage('Balance', wrongGroup);
        assert.strictEqual(result, null);
    });

    await t.test('identifies Balance command', () => {
        // We won't test the actual JSON side effect here to avoid messing with real files
        // but we can check if it returns a string (the result of the controller call)
        // or we can mock the Controller.
    });
});

test('Regex Parser', async (t) => {
    const controller = new FinancialController();

    await t.test('Expense regex matches correctly', () => {
        const msg = "Gasté 35.50 euros en Madrid, día 2";
        const expenseRegex = /Gasté (\d+(?:\.\d+)?) euros en ([\w\s]+), día (\d+)/i;
        const match = msg.match(expenseRegex);

        assert.ok(match);
        assert.strictEqual(match[1], "35.50");
        assert.strictEqual(match[2], "Madrid");
        assert.strictEqual(match[3], "2");
    });


    await t.test('Expense regex matches city with spaces', () => {
        const msg = "Gasté 10 euros en San Sebastian, día 5";
        const expenseRegex = /Gasté (\d+(?:\.\d+)?) euros en ([\w\s]+), día (\d+)/i;
        const match = msg.match(expenseRegex);

        assert.ok(match);
        assert.strictEqual(match[2], "San Sebastian");
    });

    await t.test('Random expense regex matches correctly', () => {
        const msg = "Gasté 50 euros en random";
        const randomRegex = /Gast[eé] (\d+(?:\.\d+)?) euros en random/i;
        const match = msg.match(randomRegex);

        assert.ok(match);
        assert.strictEqual(match[1], "50");
    });
});

test('Random Account Logic', async (t) => {
    // Setup temp env for this test
    const TEST_DIR_RANDOM = path.join(__dirname, 'test_tmp_random');
    if (!fs.existsSync(TEST_DIR_RANDOM)) fs.mkdirSync(TEST_DIR_RANDOM);

    const randomConfig = {
        presupuesto: path.join(TEST_DIR_RANDOM, 'presupuesto.json'),
        estado: path.join(TEST_DIR_RANDOM, 'estado.json'),
        logs: path.join(TEST_DIR_RANDOM, 'logs.json')
    };

    // Initialize mock files
    fs.writeFileSync(randomConfig.presupuesto, JSON.stringify({
        configuracion: { presupuesto_random: 500 },
        presupuesto_diario: {}
    }));
    fs.writeFileSync(randomConfig.estado, JSON.stringify({ estados_diarios: {}, balance_acumulado: 0 }));
    fs.writeFileSync(randomConfig.logs, JSON.stringify([]));

    await t.test('registerRandomExpense updates state and balance', () => {
        const controller = new FinancialController(randomConfig);

        // Action
        const result = controller.registerRandomExpense(50);

        // Assert
        assert.ok(result.includes("Te quedan 450.00 euros"));
        assert.strictEqual(controller.estado.random_remanente, 450);

        // Balance check: Total Budget (500) - Total Spent (50) = 450
        assert.strictEqual(controller.estado.balance_acumulado, 450);

        // Log check
        assert.strictEqual(controller.logs.length, 1);
        assert.strictEqual(controller.logs[0].tipo, 'GASTO_RANDOM');
        assert.strictEqual(controller.logs[0].monto, 50);

        // Verify file persistence
        const savedState = JSON.parse(fs.readFileSync(randomConfig.estado, 'utf8'));
        assert.strictEqual(savedState.random_remanente, 450);
    });

    // Cleanup
    if (fs.existsSync(TEST_DIR_RANDOM)) {
        fs.rmSync(TEST_DIR_RANDOM, { recursive: true, force: true });
    }
});

test('Detailed Budget Reports', async (t) => {
    const TEST_DIR_REPORT = path.join(__dirname, 'test_tmp_report');
    if (!fs.existsSync(TEST_DIR_REPORT)) fs.mkdirSync(TEST_DIR_REPORT);

    const reportConfig = {
        presupuesto: path.join(TEST_DIR_REPORT, 'presupuesto.json'),
        estado: path.join(TEST_DIR_REPORT, 'estado.json'),
        logs: path.join(TEST_DIR_REPORT, 'logs.json')
    };

    fs.writeFileSync(reportConfig.presupuesto, JSON.stringify({
        configuracion: { presupuesto_random: 100 },
        presupuesto_diario: {
            "Madrid": { "dia_1": 50 }
        }
    }));
    fs.writeFileSync(reportConfig.estado, JSON.stringify({ estados_diarios: {}, balance_acumulado: 0 }));
    fs.writeFileSync(reportConfig.logs, JSON.stringify([]));

    const controller = new FinancialController(reportConfig);

    await t.test('getBudgetReport(false) returns initial totals', () => {
        const result = controller.getBudgetReport(false);
        assert.ok(result.includes("PLANIFICACIÓN"));
        assert.ok(result.includes("Madrid"));
        assert.ok(result.includes("Día 1: 50.00€"));
        assert.ok(result.includes("Asignado: 100.00€"));
    });

    await t.test('getBudgetReport(true) returns actual remaining', () => {
        controller.registerExpense(10, "Madrid", 1);
        const result = controller.getBudgetReport(true);
        assert.ok(result.includes("ACTUAL"));
        assert.ok(result.includes("Día 1: 40.00€"));
        assert.ok(result.includes("Disponible: 100.00€"));
    });

    if (fs.existsSync(TEST_DIR_REPORT)) {
        fs.rmSync(TEST_DIR_REPORT, { recursive: true, force: true });
    }
});

test('City Balance Logic', async (t) => {
    await t.test('getCityBalanceMessage returns correct info for city with budget', () => {
        const controller = new FinancialController();
        controller.presupuesto = {
            totales_por_ciudad: { "Madrid": 500 }
        };
        controller.logs = [
            { tipo: 'GASTO', monto: 100, ciudad: 'Madrid' },
            { tipo: 'GASTO', monto: 50, ciudad: 'Madrid' },
            { tipo: 'GASTO', monto: 200, ciudad: 'Paris' } // Different city
        ];

        const result = controller.getCityBalanceMessage('Madrid');
        assert.ok(result.includes("has gastado 150.00 euros"));
        assert.ok(result.includes("Te quedan 350.00 euros"));
    });

    await t.test('getCityBalanceMessage handles unknown city', () => {
        const controller = new FinancialController();
        controller.presupuesto = { totales_por_ciudad: {} };
        const result = controller.getCityBalanceMessage('Unknown');
        assert.ok(result.includes("No encontré un presupuesto total"));
    });
});

