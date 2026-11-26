/*
 * Every test starts with no storage figures remembered (db/storageUsage.ts):
 * the first capped save in a test counts for real, as the tests written before
 * the figures expect. The tests of the figures themselves build them up within
 * one test.
 */
import { beforeEach } from 'vitest';
import { forgetAllUsage } from '../../db/storageUsage.js';

beforeEach(() => { forgetAllUsage(); });
