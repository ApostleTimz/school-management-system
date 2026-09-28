'use strict';

const util = require('util');
const env = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = env.logLevel;

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
};

const useColor = !env.isTest && !process.env.NO_COLOR && process.stdout.isTTY;

function paint(color, text) {
  return useColor ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

function emit(stream, color, level, args) {
  if (env.logSilent) return;
  const timestamp = new Date().toISOString();
  const prefix = `${paint('gray', timestamp)} ${paint(color, level.toUpperCase().padEnd(5))}`;
  // `map` would pass (value, index, array) to util.format, which would append
  // the index and the array to every message.
  stream(`${prefix} ${args.map((arg) => util.format(arg)).join(' ')}`);
}

const logger = {
  info: (...args) => emit(console.log, 'cyan', 'info', args),
  warn: (...args) => emit(console.warn, 'yellow', 'warn', args),
  error: (...args) => emit(console.error, 'red', 'error', args),
  debug: (...args) => {
    if (LEVELS[activeLevel] >= LEVELS.debug && !env.logSilent) emit(console.log, 'gray', 'debug', args);
  },
  colors: { paint },
};

module.exports = logger;
