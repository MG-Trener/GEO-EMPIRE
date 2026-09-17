BEGIN;

CREATE TABLE project_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  development_project_id uuid NOT NULL UNIQUE REFERENCES development_projects(id) ON DELETE CASCADE,
  principal bigint NOT NULL CHECK (principal > 0),
  total_due bigint NOT NULL CHECK (total_due >= principal),
  outstanding bigint NOT NULL CHECK (outstanding >= 0),
  annual_interest_rate numeric(8,6) NOT NULL CHECK (annual_interest_rate >= 0),
  repayment_share numeric(8,6) NOT NULL CHECK (repayment_share > 0 AND repayment_share <= 1),
  status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'repaid', 'cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  repaid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_loans_player_idx
  ON project_loans (player_id, status, updated_at DESC);

CREATE TABLE loan_transactions (
  id bigserial PRIMARY KEY,
  loan_id uuid NOT NULL REFERENCES project_loans(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  transaction_type varchar(24) NOT NULL CHECK (transaction_type IN ('disbursement', 'repayment')),
  reference_type varchar(48),
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loan_transactions_loan_idx
  ON loan_transactions (loan_id, created_at DESC);

COMMIT;
