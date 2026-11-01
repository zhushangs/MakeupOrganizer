-- Failed sign-ins, for locking out password guessing.
-- key = the visitor's IP, plus one row with key '*' counting failures from everyone.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
