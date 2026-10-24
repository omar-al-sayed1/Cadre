-- Runs once when the Docker volume is first created: the database used by
-- integration and end-to-end tests (they truncate it — never point them at dev data).
CREATE DATABASE interviewer_test OWNER interviewer;
