
CREATE TABLE public.clinical_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN (
    'suggestion_shown','suggestion_accepted','suggestion_dismissed',
    'ai_consult','lab_critical_shown','ges_alert_shown'
  )),
  source text NOT NULL CHECK (source IN (
    'ges','lab','consultor','interactions','peds','dx-suggest','arsenal','farmacia','other'
  )),
  rule_id text,
  patient_hash text,
  ruleset_composite text,
  ext_version text,
  session_id text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  CONSTRAINT clinical_audit_evidence_size CHECK (octet_length(evidence::text) <= 16384),
  CONSTRAINT clinical_audit_rule_id_len CHECK (rule_id IS NULL OR char_length(rule_id) <= 200),
  CONSTRAINT clinical_audit_hash_len CHECK (patient_hash IS NULL OR char_length(patient_hash) <= 128)
);

CREATE INDEX idx_clinical_audit_created ON public.clinical_audit(created_at DESC);
CREATE INDEX idx_clinical_audit_source ON public.clinical_audit(source);
CREATE INDEX idx_clinical_audit_event ON public.clinical_audit(event_type);
CREATE INDEX idx_clinical_audit_patient ON public.clinical_audit(patient_hash);
CREATE INDEX idx_clinical_audit_ruleset ON public.clinical_audit(ruleset_composite);

ALTER TABLE public.clinical_audit ENABLE ROW LEVEL SECURITY;

-- Inserción abierta (la extensión publica sin sesión Supabase). Validación en CHECK.
CREATE POLICY "Anyone can append audit"
  ON public.clinical_audit FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Solo admins leen.
CREATE POLICY "Admins read audit"
  ON public.clinical_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Inmutabilidad: bloquear UPDATE y DELETE para todos los roles.
CREATE OR REPLACE FUNCTION public.clinical_audit_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'clinical_audit es append-only: % no permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER clinical_audit_no_update
  BEFORE UPDATE ON public.clinical_audit
  FOR EACH ROW EXECUTE FUNCTION public.clinical_audit_block_mutation();

CREATE TRIGGER clinical_audit_no_delete
  BEFORE DELETE ON public.clinical_audit
  FOR EACH ROW EXECUTE FUNCTION public.clinical_audit_block_mutation();
