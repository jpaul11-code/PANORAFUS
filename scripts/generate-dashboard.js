'use strict';

const path = require('path');
const { generateDashboardFile } = require('../src/dashboard');

generateDashboardFile(path.resolve(__dirname, '..'));
