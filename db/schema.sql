-- AGI Research database schema (idempotent: safe to re-run)

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL,
  display_name  VARCHAR(120) NOT NULL,
  role          ENUM('admin','researcher','viewer') NOT NULL DEFAULT 'researcher',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agents (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  description TEXT NULL,
  model       VARCHAR(120) NULL,
  config      JSON NULL,
  status      ENUM('idle','running','paused','error','retired') NOT NULL DEFAULT 'idle',
  created_by  BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agents_name (name),
  KEY idx_agents_status (status),
  CONSTRAINT fk_agents_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS research_projects (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  summary     TEXT NULL,
  status      ENUM('draft','active','completed','archived') NOT NULL DEFAULT 'draft',
  owner_id    BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projects_status (status),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS datasets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(160) NOT NULL,
  description TEXT NULL,
  source_uri  VARCHAR(512) NULL,
  version     VARCHAR(40) NOT NULL DEFAULT '1',
  metadata    JSON NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_datasets_name_version (name, version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS experiments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id  BIGINT UNSIGNED NOT NULL,
  agent_id    BIGINT UNSIGNED NULL,
  dataset_id  BIGINT UNSIGNED NULL,
  name        VARCHAR(255) NOT NULL,
  hypothesis  TEXT NULL,
  status      ENUM('planned','running','completed','failed','cancelled') NOT NULL DEFAULT 'planned',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_experiments_project (project_id),
  KEY idx_experiments_status (status),
  CONSTRAINT fk_experiments_project FOREIGN KEY (project_id) REFERENCES research_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_experiments_agent   FOREIGN KEY (agent_id)   REFERENCES agents (id) ON DELETE SET NULL,
  CONSTRAINT fk_experiments_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS experiment_runs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  experiment_id BIGINT UNSIGNED NOT NULL,
  params        JSON NULL,
  metrics       JSON NULL,
  status        ENUM('queued','running','succeeded','failed','cancelled') NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  started_at    TIMESTAMP NULL,
  finished_at   TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_runs_experiment (experiment_id),
  KEY idx_runs_status (status),
  CONSTRAINT fk_runs_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS evaluations (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id     BIGINT UNSIGNED NOT NULL,
  benchmark  VARCHAR(160) NOT NULL,
  score      DOUBLE NOT NULL,
  details    JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_evaluations_run (run_id),
  KEY idx_evaluations_benchmark (benchmark),
  CONSTRAINT fk_evaluations_run FOREIGN KEY (run_id) REFERENCES experiment_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agent_id   BIGINT UNSIGNED NOT NULL,
  run_id     BIGINT UNSIGNED NULL,
  level      ENUM('debug','info','warn','error') NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  context    JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_agent_time (agent_id, created_at),
  CONSTRAINT fk_logs_agent FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_run   FOREIGN KEY (run_id)   REFERENCES experiment_runs (id) ON DELETE SET NULL
) ENGINE=InnoDB;
