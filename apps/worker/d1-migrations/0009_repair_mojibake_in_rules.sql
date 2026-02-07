-- Repair common UTF-8/Latin-1 mojibake sequences for Norwegian letters in rules.
-- This fixes match_value so categorization works even when a seeded migration inserted mis-encoded text.
-- Safe to run multiple times.

UPDATE rules
SET
  name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    name,
    'ÃƒÂ¥', 'å'),
    'ÃƒÂ¸', 'ø'),
    'ÃƒÂ¦', 'æ'),
    'ÃƒÂ…', 'Å'),
    'ÃƒÂ˜', 'Ø'),
    'ÃƒÂ†', 'Æ'),
    'Ã¥', 'å'),
    'Ã¸', 'ø'),
    'Ã¦', 'æ'),
    'Ã…', 'Å'),
    'Ã˜', 'Ø'),
    'Ã†', 'Æ'),
  match_value = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    match_value,
    'ÃƒÂ¥', 'å'),
    'ÃƒÂ¸', 'ø'),
    'ÃƒÂ¦', 'æ'),
    'ÃƒÂ…', 'Å'),
    'ÃƒÂ˜', 'Ø'),
    'ÃƒÂ†', 'Æ'),
    'Ã¥', 'å'),
    'Ã¸', 'ø'),
    'Ã¦', 'æ'),
    'Ã…', 'Å'),
    'Ã˜', 'Ø'),
    'Ã†', 'Æ'),
  match_value_secondary = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    match_value_secondary,
    'ÃƒÂ¥', 'å'),
    'ÃƒÂ¸', 'ø'),
    'ÃƒÂ¦', 'æ'),
    'ÃƒÂ…', 'Å'),
    'ÃƒÂ˜', 'Ø'),
    'ÃƒÂ†', 'Æ'),
    'Ã¥', 'å'),
    'Ã¸', 'ø'),
    'Ã¦', 'æ'),
    'Ã…', 'Å'),
    'Ã˜', 'Ø'),
    'Ã†', 'Æ')
WHERE
  name LIKE '%Ã%'
  OR match_value LIKE '%Ã%'
  OR (match_value_secondary IS NOT NULL AND match_value_secondary LIKE '%Ã%');

