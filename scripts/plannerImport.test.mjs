import assert from 'node:assert/strict';
import { parsePlannerImportLine, parsePlannerImportText } from '../src/utils/plannerImport.ts';

const explicitCalendar = parsePlannerImportLine('CALENDAR | GP appointment | 28/05/2026 | 11:30 | 12:00 | 30m | ORANGE |', 0);
assert.equal(explicitCalendar.destination, 'CALENDAR');
assert.equal(explicitCalendar.date, '2026-05-28');
assert.equal(explicitCalendar.start, '11:30');
assert.equal(explicitCalendar.end, '12:00');
assert.equal(explicitCalendar.durationMinutes, 30);
assert.equal(explicitCalendar.reviewColour, 'ORANGE');
assert.equal(explicitCalendar.isMalformed, false);

const defaultDurationCalendar = parsePlannerImportLine('CALENDAR | Review forms | 29/05/2026 | 09:00 | | | ORANGE |', 1);
assert.equal(defaultDurationCalendar.destination, 'CALENDAR');
assert.equal(defaultDurationCalendar.durationMinutes, 30);
assert.equal(defaultDurationCalendar.end, '09:30');
assert.equal(defaultDurationCalendar.reviewColour, 'ORANGE');
assert.equal(defaultDurationCalendar.isMalformed, false);

const datedInbox = parsePlannerImportLine('LIFE_INBOX | Visiting Ugo and Ola | 25/05/2026 | | | | ORANGE |', 2);
assert.equal(datedInbox.destination, 'LIFE_INBOX');
assert.equal(datedInbox.date, '2026-05-25');
assert.equal(datedInbox.start, undefined);
assert.equal(datedInbox.reviewColour, 'ORANGE');
assert.equal(datedInbox.isMalformed, false);

const undatedInbox = parsePlannerImportLine('LIFE_INBOX | Book dentist appointment | | | | | GREEN |', 3);
assert.equal(undatedInbox.destination, 'LIFE_INBOX');
assert.equal(undatedInbox.date, undefined);
assert.equal(undatedInbox.reviewColour, 'GREEN');
assert.equal(undatedInbox.isMalformed, false);

const redUnclear = parsePlannerImportLine('LIFE_INBOX | Check weird line | | | | | RED | Needs looking at', 4);
assert.equal(redUnclear.reviewColour, 'RED');
assert.equal(redUnclear.notes, 'Needs looking at');
assert.equal(redUnclear.isMalformed, false);

const malformed = parsePlannerImportLine('CALENDAR | Missing date | | 11:00 | | | ORANGE |', 5);
assert.equal(malformed.isMalformed, true);

const parsed = parsePlannerImportText(`

CALENDAR | A&E Shift | 12/06/2026 | 08:00 | 18:00 | 10h | GREEN | Emergency Department

`);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].durationMinutes, 600);
assert.equal(parsed[0].notes, 'Emergency Department');

console.log('planner import parser tests passed');
