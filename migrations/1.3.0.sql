-- EXECUÇÃO MANUAL. Selecione o banco correto antes de importar no phpMyAdmin.
-- Nenhum DROP/ALTER/DELETE de dados existentes. DDL não é uma transação global.
-- Tabelas com prefixo mf3_. Não reutilize tabelas preexistentes de outra aplicação.
CREATE TABLE IF NOT EXISTS mf3_state (
  id TINYINT UNSIGNED PRIMARY KEY,
  schema_version VARCHAR(20) CHARACTER SET ascii NOT NULL,
  data_ready TINYINT UNSIGNED NOT NULL DEFAULT 0,
  import_digest CHAR(64) CHARACTER SET ascii NULL,
  setup_consumed TINYINT UNSIGNED NOT NULL DEFAULT 0,
  setup_hash CHAR(64) CHARACTER SET ascii NULL,
  setup_expires_ms BIGINT UNSIGNED NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL,
  active TINYINT UNSIGNED NOT NULL DEFAULT 1,
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mf3_email (email)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_sessions (
  token_hash CHAR(64) CHARACTER SET ascii PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  csrf_token CHAR(64) CHARACTER SET ascii NOT NULL,
  auth_version INT UNSIGNED NOT NULL,
  expires_ms BIGINT UNSIGNED NOT NULL,
  KEY ix_mf3_session_expiry (expires_ms),
  CONSTRAINT fk_mf3_session_user FOREIGN KEY (user_id) REFERENCES mf3_admins(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_attempts (
  rate_key CHAR(64) CHARACTER SET ascii PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  reset_ms BIGINT UNSIGNED NOT NULL,
  KEY ix_mf3_attempt_expiry (reset_ms)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_projects (
  id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
  token CHAR(48) CHARACTER SET ascii NOT NULL,
  created_at VARCHAR(32) CHARACTER SET ascii NOT NULL,
  payload LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  UNIQUE KEY uq_mf3_project_token (token),
  KEY ix_mf3_project_date (created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_decisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id CHAR(36) CHARACTER SET ascii NOT NULL,
  status VARCHAR(32) CHARACTER SET ascii NOT NULL,
  comment TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  decided_at VARCHAR(32) CHARACTER SET ascii NOT NULL,
  CONSTRAINT fk_mf3_decision_project FOREIGN KEY (project_id) REFERENCES mf3_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_branding (
  id TINYINT UNSIGNED PRIMARY KEY,
  payload LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mf3_assets (
  name VARCHAR(64) CHARACTER SET ascii PRIMARY KEY,
  mime VARCHAR(40) CHARACTER SET ascii NOT NULL,
  content MEDIUMBLOB NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO mf3_state (id,schema_version) VALUES (1,'1.3.0');
