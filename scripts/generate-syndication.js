'use strict';

const path = require('path');
const { writeSyndicationArtifacts } = require('../src/syndication');

writeSyndicationArtifacts(path.resolve(__dirname, '..'));
